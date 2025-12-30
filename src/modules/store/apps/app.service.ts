import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetAppsQuery, PaginatedAppsResponse, DownloadAppDto, AppResponse } from './app.types';

@Injectable()
export class AppsService {
    private s3Client: S3Client;
    private reports: any[] = []; // In-memory storage for reports

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) {
        try {
            this.s3Client = new S3Client({
                region: 'ap-south-1',
                credentials: {
                    accessKeyId:
                        this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
                    secretAccessKey: this.configService.getOrThrow<string>(
                        'AWS_SECRET_ACCESS_KEY',
                    ),
                },
            });
        } catch (e) {
            console.warn('AWS S3 Client failed to initialize', e);
        }
    }

    async reportApp(appId: string, dto: { reason: string; description: string; reporterName: string; reporterEmail: string }) {
        const app = await this.prisma.app.findUnique({ where: { id: appId } });
        const report = {
            id: Math.random().toString(36).substr(2, 9),
            appId,
            appName: app ? app.name : 'Unknown App',
            ...dto,
            createdAt: new Date(),
            status: 'pending'
        };
        this.reports.unshift(report); // Add to beginning
        return { success: true };
    }

    async getReports() {
        return this.reports;
    }

    async findAll(query: GetAppsQuery): Promise<PaginatedAppsResponse> {
        const { cursor, limit = 20, category, search, sort, availability } = query;
        const take = Number(limit) + 1;

        const where: any = {
            status: 'live',
            visibility: 'public',
            // Ensure we only show apps with an approved current build
            currentBuild: {
                status: 'approved',
            },
        };

        if (category) {
            where.category = category;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { shortDescription: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (availability) {
            where.OR = [
                { distributionMode: 'global' },
                { distributionRegions: { has: availability } },
            ];
        }

        let orderBy: any = { users: 'desc' }; // Default popular
        // @ts-ignore
        if (sort === 'newest') orderBy = { publishedAt: 'desc' };
        else if (sort === 'rating') orderBy = { users: 'desc' }; // Mock: rating not in DB, use users

        const appsRaw = await this.prisma.app.findMany({
            where,
            take, // We might fetch more and filter, but for now stick to simple
            cursor: cursor ? { id: cursor } : undefined,
            orderBy,
            include: {
                developer: true,
                // currentBuild: true, // Removed relation include
            },
        });

        // Manual Join for Builds to bypass potential stale Prisma Client relation issues
        const buildIds = appsRaw.map((a: any) => a.currentBuildId).filter(Boolean);
        const builds = await this.prisma.build.findMany({
            where: { id: { in: buildIds } }
        });
        const buildMap = new Map(builds.map(b => [b.id, b]));

        // Filter and Map
        const items: AppResponse[] = [];
        let fetchedCount = 0;
        let lastAppId = null;

        for (const app of appsRaw) {
            fetchedCount++;
            lastAppId = app.id;

            const build = buildMap.get((app as any).currentBuildId);
            // In-memory filter for approved build
            if (!build || build.status !== 'approved') continue;

            // Check visibility if available (might be undefined if stale client)
            const viz = (app as any).visibility || 'public';
            if (viz !== 'public') continue;

            // Attach build manually for mapper
            (app as any).currentBuild = build;
            items.push(this.mapToAppResponse(app));
        }

        let nextCursor: string | null = null;
        if (appsRaw.length > take - 1) { // If we fetched limit+1 (take)
            const nextItem = appsRaw.pop(); // Remove the extra item
            nextCursor = nextItem!.id;
        }

        return {
            items,
            nextCursor,
        };
    }

    async findOne(appId: string, user?: any): Promise<AppResponse> {
        const app = await this.prisma.app.findUnique({
            where: { id: appId },
            include: {
                developer: true,
                // currentBuild: true, // Manual join
            },
        });

        if (!app) {
            throw new NotFoundException('App not found');
        }

        // Manual Build Fetch
        let currentBuild: any = null;
        if ((app as any).currentBuildId) { // Check if we have ID from stale client? 
            // If stale client, app doesn't have currentBuildId property on type, but DB returns it?
            // Only if we selected it? verify keys...
            // findUnique includes scalars by default.
            currentBuild = await this.prisma.build.findUnique({
                where: { id: (app as any).currentBuildId }
            });
        }
        (app as any).currentBuild = currentBuild;

        // Business Rules
        if (app.status !== 'live' || !currentBuild || currentBuild.status !== 'approved') {
            // Strict availability check
            throw new NotFoundException('App not available');
        }

        const visibility = (app as any).visibility || 'public';
        if (visibility === 'unlisted') {
            // Unlisted logic (allow if ID is known, which it is if we are here)
        }

        if (visibility === 'private') {
            throw new ForbiddenException('This app is private');
        }

        // Availability check
        // if (availability && ...) - availability usually handled by client or search filter.

        return this.mapToAppDetailResponse(app);
    }

    async getDownloadUrl(appId: string, dto: DownloadAppDto, userId: string): Promise<{ downloadUrl: string }> {
        const app = await this.prisma.app.findUnique({
            where: { id: appId },
            // Removed relate include to avoid stale client crash
        });

        if (!app || app.status !== 'live') {
            throw new NotFoundException('App download not available');
        }

        // Manual Build Fetch
        let currentBuild: any = null;
        if ((app as any).currentBuildId) {
            currentBuild = await this.prisma.build.findUnique({
                where: { id: (app as any).currentBuildId }
            });
        }

        if (!currentBuild || currentBuild.status !== 'approved') {
            throw new NotFoundException('App download not available');
        }

        // Check Pricing
        if (app.pricingModel === 'paid' || app.pricingModel === 'sub') {
            // Check purchase in `Invoice` or `Subscription`
            const hasAccess = await this.checkUserAccess(userId, app.id);
            if (!hasAccess) {
                throw new ForbiddenException('Purchase required');
            }
        }

        const build = currentBuild;
        const platforms: any = build.platforms;
        const platformData = platforms[dto.platform?.toLowerCase()];

        if (!platformData || !platformData.buildId) {
            throw new NotFoundException(`Platform ${dto.platform} not supported`);
        }

        // Generate specific S3 key for the build artifact
        // "buildId" acts as the filename in the new structure
        const key = `apps/${app.id}/builds/${platformData.buildId}`;

        const bucketName = this.configService.getOrThrow('AWS_S3_BUCKET_NAME');
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });

        const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });

        // Increment download count (users count in App)
        // @ts-ignore
        await this.prisma.app.update({
            where: { id: appId },
            data: { users: { increment: 1 } }
        });

        return { downloadUrl: url };
    }

    private async checkUserAccess(userId: string, appId: string): Promise<boolean> {
        // Mock logic or check Invoices
        // Check Invoice type=SINGLE_PURCHASE and some reference?
        // Since schema doesn't link Invoice to App directly (it has paymentReferenceId?), I'll assume paymentReferenceId == appId.
        const purchase = await this.prisma.invoice.findFirst({
            where: {
                userId,
                status: 'PAID',
                paymentReferenceId: appId
            }
        });
        return !!purchase;
    }

    private mapToAppResponse(app: any): AppResponse {
        let icons = app.icons;
        if (typeof icons === 'string') {
            try {
                icons = JSON.parse(icons);
            } catch (e) {
                console.warn("Failed to parse app icons JSON", e);
                icons = {};
            }
        }
        const icon = icons?.['512'] || icons?.['144'] || '';

        return {
            id: app.id,
            name: app.name,
            icon,
            category: app.category || 'Uncategorized',
            shortDescription: app.shortDescription || '',
            availability: app.distributionMode === 'global' ? 'Global' : app.distributionRegions?.[0] || 'Unknown',
            publisher: {
                id: app.developer.id,
                name: app.developer.fullName,
                verified: app.developer.verifiedBadge,
                avatar: app.developer.avatarUrl,
            },
            pricing: {
                type: app.pricingModel || 'free',
                price: app.price || 0,
                currency: 'INR', // Default
            },
            stats: {
                downloads: app.users,
                rating: 4.5, // Mock
            },
            branding: {
                activeColor: app.color,
            },
            media: {
                featureBanner: app.bannerUrl,
                previewVideo: app.videoUrl,
                screenshots: app.screenshots || [],
            },
        };
    }

    private mapToAppDetailResponse(app: any): AppResponse {
        const base = this.mapToAppResponse(app);

        // Parse platforms from build
        const platformsRaw = app.currentBuild?.platforms as any;
        // Clone to avoid mutation issues and allow enrichment
        const platforms = platformsRaw ? JSON.parse(JSON.stringify(platformsRaw)) : {};

        // Enrich platforms with size from App if missing in Build (Backwards compatibility / Data fix)
        if (app.buildSize && app.buildSize > 0) {
            const sizeMB = parseFloat((app.buildSize / (1024 * 1024)).toFixed(1));
            // Ensure at least windows exists if we have size but no platform details (common legacy case)
            if (Object.keys(platforms).length === 0 && app.platforms?.includes('windows')) {
                platforms['windows'] = { buildId: 'legacy', sizeMB };
            }

            // Backfill existing keys
            Object.keys(platforms).forEach(key => {
                if (!platforms[key].sizeMB) {
                    platforms[key].sizeMB = sizeMB;
                }
            });
        }

        const supportedPlatforms = platforms ? Object.keys(platforms) : (app.platforms || []);

        return {
            ...base,
            branding: {
                activeColor: app.color,
            },
            publisher: {
                ...base.publisher,
                bio: app.developer.bio,
            },
            descriptions: {
                short: app.shortDescription,
                long: app.fullDescription,
            },
            build: {
                version: app.currentBuild?.version || '1.0.0',
                platforms: platforms,
            },
            supportedPlatforms: supportedPlatforms,
            media: {
                featureBanner: app.bannerUrl,
                previewVideo: app.videoUrl,
                screenshots: app.screenshots || [],
            },
            seo: {
                keywords: app.tags || [],
            },
            privacy: {
                tracking: app.privacyTracking || [],
                linked: app.privacyLinked || [],
            },
            info: {
                provider: app.developer.fullName,
                ageRating: app.ageRating || '4+',
                copyright: app.copyright || `© ${new Date().getFullYear()} ${app.developer.fullName}`,
                website: app.website,
                supportEmail: app.supportEmail,
                languages: ['English'], // Default for now
            }
        };
    }

    async getReviews(appId: string) {
        // @ts-ignore
        const reviews = await this.prisma.review.findMany({
            where: { appId },
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { fullName: true } } }
        });

        const total = reviews.length;
        const sum = reviews.reduce((acc: any, r: any) => acc + r.rating, 0);
        const avg = total > 0 ? sum / total : 0;

        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviews.forEach((r: any) => {
            // @ts-ignore
            if (distribution[r.rating] !== undefined) distribution[r.rating]++;
        });

        return {
            reviews: reviews.map((r: any) => ({
                ...r,
                userName: r.user ? r.user.fullName : 'Guest'
            })),
            stats: {
                averageRating: avg,
                totalReviews: total,
                ratingDistribution: distribution
            }
        };
    }

    async createReview(appId: string, userId: string, dto: { rating: number; title: string; content: string }) {
        let finalUserId = userId;

        if (userId === 'guest') {
            // Find or create guest user
            let guestUser = await this.prisma.user.findUnique({ where: { email: 'guest@loopsync.cloud' } });
            if (!guestUser) {
                // @ts-ignore
                guestUser = await this.prisma.user.create({
                    data: {
                        email: 'guest@loopsync.cloud',
                        fullName: 'Guest',
                        status: 'VERIFIED',
                        accountType: 'VISITOR',
                        provider: 'EMAIL'
                    }
                });
            }
            finalUserId = guestUser.id;
        }

        // @ts-ignore
        const review = await this.prisma.review.create({
            data: {
                appId,
                userId: finalUserId,
                rating: dto.rating,
                title: dto.title,
                content: dto.content,
            },
            include: { user: { select: { fullName: true } } }
        });

        return { ...review, userName: review.user.fullName };
    }

    async deleteReview(appId: string, reviewId: string, userId: string) {
        // Resolve Guest ID if needed
        let finalUserId = userId;
        if (userId === 'guest') {
            const guestUser = await this.prisma.user.findUnique({ where: { email: 'guest@loopsync.cloud' } });
            if (guestUser) finalUserId = guestUser.id;
        }

        // @ts-ignore
        const review = await this.prisma.review.findUnique({ where: { id: reviewId } });

        if (!review) throw new NotFoundException('Review not found');
        if (review.appId !== appId) throw new BadRequestException('Review does not belong to this app'); // Safety check

        // Ownership check
        if (review.userId !== finalUserId) {
            throw new ForbiddenException('You can only delete your own reviews');
        }

        // Time limit check (10 minutes)
        const age = Date.now() - new Date(review.createdAt).getTime();
        if (age > 10 * 60 * 1000) {
            throw new ForbiddenException('You can only delete reviews within 10 minutes of posting');
        }

        // @ts-ignore
        await this.prisma.review.delete({ where: { id: reviewId } });
        return { success: true };
    }
}

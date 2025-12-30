export interface GetAppsQuery {
    cursor?: string;
    limit?: number;
    category?: string;
    search?: string;
    sort?: 'popular' | 'newest' | 'rating';
    availability?: string;
}

export interface DownloadAppDto {
    platform: string;
}

export interface AppResponse {
    id: string;
    name: string;
    icon: string;
    category: string;
    shortDescription: string;
    availability: string | string[]; // Can be string or array depending on usage
    publisher: {
        id: string;
        name: string;
        verified: boolean;
        bio?: string;
        avatar?: string;
    };
    pricing: {
        type: string;
        price?: number;
        currency?: string;
    };
    stats?: {
        downloads: number;
        rating: number;
    };
    branding?: {
        activeColor: string;
    };
    descriptions?: {
        short: string;
        long: string;
    };
    supportedPlatforms?: string[];
    media?: {
        featureBanner: string;
        previewVideo: string;
        screenshots: string[];
    };
    seo?: {
        keywords: string[];
    };
    build?: {
        version: string;
        platforms: Record<string, { buildId: string; sizeMB: number }>;
    };
    privacy?: {
        tracking: string[];
        linked: string[];
    };
    info?: {
        provider: string;
        ageRating: string;
        copyright: string;
        website?: string;
        supportEmail?: string;
        languages?: string[];
    };
}

export interface PaginatedAppsResponse {
    items: AppResponse[];
    nextCursor: string | null;
}

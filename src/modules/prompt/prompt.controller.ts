import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PromptService } from './prompt.service';
import { SanitizePromptDto } from './dto/sanitize-prompt.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Prompt')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('v1/prompt')
export class PromptController {
  constructor(private readonly promptService: PromptService) {}

  @ApiOperation({ summary: 'Sanitize a raw prompt' })
  @Post('sanitize')
  async sanitize(@Body() body: SanitizePromptDto): Promise<any> {
    if (!body.rawPrompt || body.rawPrompt.trim().length === 0) {
      return { status: 'error', error: 'rawPrompt is required.' };
    }

    const includeMandatoryBlock =
      body.includeMandatoryBlock === undefined
        ? true
        : body.includeMandatoryBlock;

    try {
      const result = await this.promptService.sanitize(
        body.rawPrompt,
        body.provider,
        body.scope,
      );

      const finalPrompt = includeMandatoryBlock
        ? this.promptService.buildFinalPrompt(result.sanitizedPrompt)
        : null;

      return {
        status: 'success',
        rawPrompt: body.rawPrompt,
        sanitizedPrompt: result.sanitizedPrompt,
        finalPrompt,
        meta: result.meta,
      };
    } catch (e) {
      const details =
        e instanceof Error && e.message === 'upstream_error'
          ? 'upstream LLM timeout'
          : undefined;
      return {
        status: 'error',
        error: 'Prompt sanitization failed. Please try again.',
        details,
      };
    }
  }
}

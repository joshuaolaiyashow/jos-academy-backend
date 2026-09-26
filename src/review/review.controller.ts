import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      "Rate a completed course (creates or updates the student's review)",
  })
  @ApiResponse({ status: 200, description: 'Review created or updated.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - course not completed by this student.',
  })
  async upsertReview(@Req() req: any, @Body() dto: CreateReviewDto) {
    return this.reviewService.upsertReview(
      req.user.id,
      dto.courseId,
      dto.rating,
      dto.comment,
    );
  }

  @Get()
  @ApiOperation({ summary: "Get a course's reviews with average rating" })
  @ApiQuery({ name: 'courseId', required: true, description: 'Course ID' })
  @ApiResponse({ status: 200, description: 'Reviews for the course.' })
  async getCourseReviews(@Query('courseId') courseId: string) {
    return this.reviewService.getCourseReviews(courseId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Get the logged-in student's own review for a course, if any",
  })
  @ApiQuery({ name: 'courseId', required: true, description: 'Course ID' })
  @ApiResponse({ status: 200, description: "The student's review, or null." })
  async getMyReview(@Req() req: any, @Query('courseId') courseId: string) {
    return this.reviewService.getMyReviewForCourse(req.user.id, courseId);
  }
}

import { Controller, Get, Param } from '@nestjs/common';
import { successResponse } from '../common/api-response';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async getProjects() {
    const projects = await this.projectsService.getProjects();
    return successResponse(projects);
  }

  @Get('slug/:slug')
  async getProjectBySlug(@Param('slug') slug: string) {
    const project = await this.projectsService.getProjectBySlug(slug);
    return successResponse(project);
  }

  @Get(':id')
  async getProjectById(@Param('id') id: string) {
    const project = await this.projectsService.getProjectById(id);
    return successResponse(project);
  }
}

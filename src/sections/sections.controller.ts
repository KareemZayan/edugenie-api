import { Controller, Post, Body, Patch, Param, Delete, Req, UseGuards } from '@nestjs/common';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto'; 
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; 

@UseGuards(JwtAuthGuard) 
@Controller('courses/:id/sections')
export class SectionsController {
    constructor(private readonly sectionsService: SectionsService) { }

    
    @Post()
    addSection(
        @Param('id') id: string,
        @Body() createSectionDto: CreateSectionDto,
        @Req() req: any
    ) {
        return this.sectionsService.addSection(id, req.user.userId, createSectionDto);
    }

    
    @Patch(':sectionId')
    updateSection(
        @Param('id') courseId: string,
        @Param('sectionId') sectionId: string,
        @Body('title') title: string,
        @Req() req: any
    ) {
        
        return this.sectionsService.updateSection(courseId, sectionId, req.user.userId, title);
    }

    
    @Delete(':sectionId')
    async removeSection( 
        @Param('id') courseId: string,
        @Param('sectionId') sectionId: string,
        @Req() req: any
    ) {
       
        await this.sectionsService.removeSection(courseId, sectionId, req.user.userId);

        
        return {
            success: true,
            message: 'Section has been removed successfully from the course ',
        };
    }
}
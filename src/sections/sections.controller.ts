import { Controller, Post, Get, Patch, Delete, Param, Body } from '@nestjs/common';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';

@Controller('courses/:courseId/sections')
export class SectionsController {
    constructor(private readonly sectionsService: SectionsService) { }

    //  CREATE
    @Post()
    addSection(
        @Param('courseId') courseId: string,
        @Body() dto: CreateSectionDto,
    ) {
        return this.sectionsService.addSection(courseId, dto);
    }

    //  GET ALL
    @Get()
    getAll(@Param('courseId') courseId: string) {
        return this.sectionsService.getSections(courseId);
    }

    //  GET ONE
    @Get(':sectionId')
    getOne(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
    ) {
        return this.sectionsService.getSection(courseId, sectionId);
    }

    //  UPDATE
    @Patch(':sectionId')
    update(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Body() dto: Partial<CreateSectionDto>,
    ) {
        return this.sectionsService.updateSection(courseId, sectionId, dto);
    }

    //  DELETE
    @Delete(':sectionId')
    remove(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
    ) {
        return this.sectionsService.deleteSection(courseId, sectionId);
    }
}
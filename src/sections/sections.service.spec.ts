import { Test, TestingModule } from '@nestjs/testing';
import { SectionsService } from './sections.service';
import { getModelToken } from '@nestjs/mongoose';
import { Course } from '../courses/schema/course.schema';
import { Types } from 'mongoose';
import { UpdateSectionDto } from './dto/update-section.dto';
import { NotFoundException } from '@nestjs/common';

describe('SectionsService', () => {
  let service: SectionsService;
  let model: any;

  const mockCourseModel = {
    findOneAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectionsService,
        {
          provide: getModelToken(Course.name),
          useValue: mockCourseModel,
        },
      ],
    }).compile();

    service = module.get<SectionsService>(SectionsService);
    model = module.get(getModelToken(Course.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateSection', () => {
    it('should successfully update a section and return updated sections', async () => {
      const courseId = new Types.ObjectId().toString();
      const sectionId = new Types.ObjectId().toString();
      const instructorId = new Types.ObjectId().toString();
      const dto: UpdateSectionDto = {
        title: 'Updated Title',
        description: 'New longer description text that passes the validator',
      };

      const mockExec = jest.fn().mockResolvedValue({
        sections: [
          {
            _id: sectionId,
            title: dto.title,
            description: dto.description,
          },
        ],
      });

      mockCourseModel.findOneAndUpdate.mockReturnValue({
        exec: mockExec,
      });

      const result = await service.updateSection(
        courseId,
        sectionId,
        instructorId,
        dto,
      );

      expect(mockCourseModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
          'sections._id': new Types.ObjectId(sectionId),
        },
        {
          $set: {
            'sections.$.title': dto.title,
            'sections.$.description': dto.description,
          },
        },
        { returnDocument: 'after', runValidators: true },
      );
      expect(result).toBeDefined();
      expect(result[0].title).toBe(dto.title);
    });

    it('should throw NotFoundException if course/section not found or unauthorized', async () => {
      const courseId = new Types.ObjectId().toString();
      const sectionId = new Types.ObjectId().toString();
      const instructorId = new Types.ObjectId().toString();
      const dto: UpdateSectionDto = { title: 'Updated Title' };

      const mockExec = jest.fn().mockResolvedValue(null);
      mockCourseModel.findOneAndUpdate.mockReturnValue({
        exec: mockExec,
      });

      await expect(
        service.updateSection(courseId, sectionId, instructorId, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

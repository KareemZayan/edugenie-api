import {
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schema/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { v2 as cloudinary } from 'cloudinary';
import { UserSerializer } from './serializers/user.serializer';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async createUser(createUserDto: CreateUserDto): Promise<UserSerializer> {
    const existingUser = await this.userModel.findOne({
      email: createUserDto.email,
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const newUser = new this.userModel(createUserDto);
    const savedUser = await newUser.save();
    return new UserSerializer(savedUser.toObject());
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async getProfile(userId: string): Promise<UserSerializer> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return new UserSerializer(user.toObject());
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto): Promise<UserSerializer> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Avatar update and deletion flow
    if (updateUserDto.avatar !== undefined) {
      // Check if user already has an avatar public ID
      if (user.avatarPublicId) {
        const isAvatarDeleted = updateUserDto.avatar === null;
        const isAvatarReplaced =
          updateUserDto.avatar !== null && updateUserDto.avatar !== user.avatar;

        // Delete the old image from Cloudinary if replacing or deleting
        if (isAvatarDeleted || isAvatarReplaced) {
          try {
            await cloudinary.uploader.destroy(user.avatarPublicId);
          } catch (error) {
            Logger.error(
              `Failed to delete Cloudinary image: ${user.avatarPublicId}`,
              error instanceof Error ? error.stack : 'Unknown error',
              'UsersService'
            );
          }
        }
      }

      if (
        updateUserDto.avatar === null &&
        updateUserDto.avatarPublicId === undefined
      ) {
        updateUserDto.avatarPublicId = null;
      }
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateUserDto },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return new UserSerializer(updatedUser.toObject());
  }
}

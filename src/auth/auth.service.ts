import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { UserSerializer } from '../users/serializers/user.serializer';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    await this.usersService.createUser({
      ...createUserDto,
      password: hashedPassword,
    });

    return {
      message: 'User registered successfully',
    };
  }

  async login(loginDto: LoginDto): Promise<{ token: string; user: UserSerializer }> {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { id: user._id, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: new UserSerializer(user.toObject()),
    };
  }
}

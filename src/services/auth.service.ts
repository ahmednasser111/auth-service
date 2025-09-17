import jwt from 'jsonwebtoken';
import ms from 'ms';
import bcrypt from 'bcrypt';
import * as Sentry from '@sentry/node';

import { AppDataSource } from '../data-source';
import { config } from '../config';
import redis from '../config/redis';
import { Repository } from 'typeorm';
import { Credential } from '../entity/credential.entity';
import { User } from '../entity/user.entity';
import { createError } from '../utils';
import { publishUserRegistered } from '../events/producers/userRegistered.producer';

interface RegisterDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

class AuthService {
  credentialRepository: Repository<Credential>;
  userRepository: Repository<User>;

  constructor() {
    this.credentialRepository = AppDataSource.getRepository(Credential);
    this.userRepository = AppDataSource.getRepository(User);
  }

  async register({ firstName, lastName, email, password }: RegisterDto) {
    // Add breadcrumb for registration attempt
    Sentry.addBreadcrumb({
      message: 'User registration attempt',
      category: 'auth',
      level: 'info',
      data: { email, firstName, lastName },
    });

    const existing = await this.credentialRepository.findOneBy({ email });

    if (existing) {
      Sentry.addBreadcrumb({
        message: 'Registration failed - email already exists',
        category: 'auth',
        level: 'warning',
        data: { email },
      });
      throw createError('email already in use', 400);
    }

    try {
      const passwordHash = await bcrypt.hash(password, 10);

      const user = new User();
      user.firstName = firstName;
      user.lastName = lastName;
      user.email = email;

      await this.userRepository.save(user);

      const credential = new Credential();
      credential.email = email;
      credential.passwordHash = passwordHash;
      credential.user = user;

      await this.credentialRepository.save(credential);

      // Set user context for Sentry
      Sentry.setUser({
        id: user.id?.toString(),
        email: user.email,
      });

      await publishUserRegistered({
        key: user.id?.toString(),
        value: user,
      });

      Sentry.addBreadcrumb({
        message: 'User registered successfully',
        category: 'auth',
        level: 'info',
        data: { userId: user.id, email },
      });

      return user;
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  }

  async login(email: string, password: string) {
    Sentry.addBreadcrumb({
      message: 'User login attempt',
      category: 'auth',
      level: 'info',
      data: { email },
    });

    const credential = await this.credentialRepository.findOne({
      where: { email },
      relations: ['user'],
    });

    if (!credential) {
      Sentry.addBreadcrumb({
        message: 'Login failed - user not found',
        category: 'auth',
        level: 'warning',
        data: { email },
      });
      throw createError('invalid credentials', 401);
    }

    const isValidPassword = await bcrypt.compare(
      password,
      credential.passwordHash,
    );

    if (!isValidPassword) {
      Sentry.addBreadcrumb({
        message: 'Login failed - invalid password',
        category: 'auth',
        level: 'warning',
        data: { email, userId: credential.user.id },
      });
      throw createError('invalid credentials', 401);
    }

    try {
      const token = jwt.sign(
        {
          id: credential.user.id,
          email: credential.email,
          firstName: credential.user.firstName,
          lastName: credential.user.lastName,
        },
        config.JWT_SECRET,
        { expiresIn: config.JWT_EXPIRES_IN as ms.StringValue },
      );

      await redis.setex(
        `auth:${credential.user.id}:${token}`,
        24 * 60 * 60,
        'true',
      );

      // Set user context for Sentry
      Sentry.setUser({
        id: credential.user.id?.toString(),
        email: credential.email,
      });

      Sentry.addBreadcrumb({
        message: 'User logged in successfully',
        category: 'auth',
        level: 'info',
        data: { userId: credential.user.id, email },
      });

      return {
        token,
        firstName: credential.user.firstName,
        lastName: credential.user.lastName,
        email: credential.email,
      };
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  }

  async logout(userId: number, token: string) {
    try {
      Sentry.addBreadcrumb({
        message: 'User logout',
        category: 'auth',
        level: 'info',
        data: { userId },
      });

      await redis.del(`auth:${userId}:${token}`);

      Sentry.addBreadcrumb({
        message: 'User logged out successfully',
        category: 'auth',
        level: 'info',
        data: { userId },
      });
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  }
}

export default AuthService;

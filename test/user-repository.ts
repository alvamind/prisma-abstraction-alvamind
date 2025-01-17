import { PrismaClient } from '@prisma/client';
import { BaseRepository, setPrismaClient } from '../src';

// Initialize PrismaStack (do this once in your app)
const abc = setPrismaClient(new PrismaClient());
abc.$connect();

export class UserRepository extends BaseRepository<typeof PrismaClient, 'user'> { }

import { PrismaClient } from '@prisma/client';
import { CachedRepository, setPrismaClient } from '../src';

// Initialize PrismaStack (do this once in your app)
const abc = setPrismaClient(new PrismaClient());
abc.$connect();

export class UserRepository extends CachedRepository<typeof PrismaClient, 'user'> { }

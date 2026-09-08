import { Queue } from 'bullmq';
import IORedis from 'ioredis';
const redis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const q = new Queue('stuck-job-sweeper', { connection: redis });
const cleaned = await q.clean(0, 1000, 'failed');
console.log('Cleaned failed jobs:', cleaned.length);
await redis.quit();

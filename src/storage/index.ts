import * as Minio from 'minio';
import { getConfig } from '../config.js';

// Export generic types/aliases
export type StorageClient = Minio.Client;
export type StorageMetadata = Minio.BucketItemStat;
export type StorageObject = {
    name: string;
    size: number;
    lastModified: Date;
    etag: string;
};

let minioClient: Minio.Client | null = null;

export function getStorageClient(): Minio.Client {
    if (!minioClient) {
        const config = getConfig();
        if (!config.storage) {
            throw new Error('Storage configuration not initialized');
        }
        minioClient = new Minio.Client(config.storage);
    }
    return minioClient;
}

export async function ensureBucket(bucketName: string, region?: string): Promise<void> {
    const client = getStorageClient();
    const exists = await client.bucketExists(bucketName);
    if (!exists) {
        await client.makeBucket(bucketName, region);
    }
}

export async function uploadFile(
    bucketName: string,
    objectName: string,
    filePath: string,
    metadata?: Record<string, string>
): Promise<string> {
    if (!bucketName || typeof bucketName !== 'string') {
        throw new Error('Bucket name must be a non-empty string');
    }
    if (!objectName || typeof objectName !== 'string') {
        throw new Error('Object name must be a non-empty string');
    }
    // Prevent path traversal
    if (objectName.includes('..')) {
        throw new Error('Object name cannot contain ".."');
    }
    await ensureBucket(bucketName);
    const client = getStorageClient();
    await client.fPutObject(bucketName, objectName, filePath, metadata);
    return objectName;
}

export async function uploadData(
    bucketName: string,
    objectName: string,
    data: Buffer | NodeJS.ReadableStream,
    size: number,
    metadata?: Record<string, string>
): Promise<any> {
    await ensureBucket(bucketName);
    const client = getStorageClient();
    return await client.putObject(bucketName, objectName, data as any, size, metadata);
}

export async function downloadFile(
    bucketName: string,
    objectName: string,
    filePath: string
): Promise<void> {
    const client = getStorageClient();
    await client.fGetObject(bucketName, objectName, filePath);
}

export async function getObjectStream(
    bucketName: string,
    objectName: string
): Promise<NodeJS.ReadableStream> {
    const client = getStorageClient();
    return await client.getObject(bucketName, objectName);
}

export async function deleteObject(bucketName: string, objectName: string): Promise<void> {
    const client = getStorageClient();
    await client.removeObject(bucketName, objectName);
}

export async function deleteObjects(bucketName: string, objectNames: string[]): Promise<void> {
    const client = getStorageClient();
    await client.removeObjects(bucketName, objectNames);
}

export async function listObjects(
    bucketName: string,
    prefix: string = '',
    recursive: boolean = true
): Promise<Array<{ name: string; size: number; lastModified: Date; etag: string }>> {
    const client = getStorageClient();
    const objects: Array<{ name: string; size: number; lastModified: Date; etag: string }> = [];
    const stream = client.listObjects(bucketName, prefix, recursive);
    for await (const obj of stream) {
        if (obj.name && obj.size !== undefined && obj.lastModified) {
            objects.push({ name: obj.name, size: obj.size, lastModified: obj.lastModified, etag: obj.etag || '' });
        }
    }
    return objects;
}

export async function getObjectMetadata(bucketName: string, objectName: string): Promise<Minio.BucketItemStat> {
    const client = getStorageClient();
    return await client.statObject(bucketName, objectName);
}

export async function getUploadUrl(bucketName: string, objectName: string, expiry: number = 3600): Promise<string> {
    await ensureBucket(bucketName);
    const client = getStorageClient();
    return await client.presignedPutObject(bucketName, objectName, expiry);
}

export async function getDownloadUrl(bucketName: string, objectName: string, expiry: number = 3600): Promise<string> {
    const client = getStorageClient();
    return await client.presignedGetObject(bucketName, objectName, expiry);
}

export async function copyObject(
    sourceBucket: string,
    sourceObject: string,
    destBucket: string,
    destObject: string
): Promise<void> {
    const client = getStorageClient();
    await ensureBucket(destBucket);
    await client.copyObject(destBucket, destObject, `/${sourceBucket}/${sourceObject}`, undefined);
}

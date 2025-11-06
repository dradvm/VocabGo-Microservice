import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, DeleteApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';
import { Readable } from 'stream';

export type AudioCloudinary = {
  public_id: string;
  secure_url: string;
};

export type ImageCloudinary = {
  public_id: string;
  secure_url: string;
};

@Injectable()
export class CloudinaryService {
  private upload(
    file: Express.Multer.File,
    folder: string,
    resource_type: 'image' | 'video'
  ): Promise<{ public_id: string; secure_url: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type, folder },
        (error, result) => {
          if (error) return reject(new Error(JSON.stringify(error)));
          resolve({
            public_id: result!.public_id,
            secure_url: result!.secure_url
          });
        }
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const stream: Readable = streamifier.createReadStream(file.buffer);
      stream.pipe(uploadStream);
    });
  }

  uploadAudio(file: Express.Multer.File, folder = 'audio') {
    return this.upload(file, folder, 'video');
  }

  async deleteAudio(publicId: string): Promise<DeleteApiResponse> {
    return cloudinary.uploader.destroy(publicId, {
      resource_type: 'video'
    }) as Promise<DeleteApiResponse>;
  }

  async deleteAudios(publicIds: string[]) {
    await Promise.all(publicIds.map((id) => this.deleteAudio(id)));
  }

  uploadImage(file: Express.Multer.File, folder = 'images') {
    return this.upload(file, folder, 'image');
  }

  async uploadImages(
    files: Express.Multer.File[],
    folder = 'images'
  ): Promise<ImageCloudinary[]> {
    return Promise.all(files.map((file) => this.uploadImage(file, folder)));
  }

  async deleteImage(publicId: string): Promise<DeleteApiResponse> {
    return cloudinary.uploader.destroy(publicId, {
      resource_type: 'image'
    }) as Promise<DeleteApiResponse>;
  }

  async deleteImages(publicIds: string[]) {
    await Promise.all(publicIds.map((id) => this.deleteImage(id)));
  }
}

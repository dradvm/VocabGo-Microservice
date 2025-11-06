import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Body,
  Delete,
  Query
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from './cloudinary.service';

@Controller('')
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('upload-audio')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAudio(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: string
  ) {
    if (!file) throw new Error('No file provided');
    const result = await this.cloudinaryService.uploadAudio(file, folder);
    return { message: 'Audio uploaded successfully', data: result };
  }

  @Delete('delete-audio')
  async deleteAudio(@Query('publicId') publicId: string) {
    if (!publicId) throw new Error('publicId is required');
    const result = await this.cloudinaryService.deleteAudio(publicId);
    return { message: 'Audio deleted successfully', data: result };
  }

  @Delete('delete-audios')
  async deleteAudios(@Body('publicIds') publicIds: string[]) {
    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0)
      throw new Error('publicIds array is required');
    await this.cloudinaryService.deleteAudios(publicIds);
    return { message: 'Audios deleted successfully' };
  }

  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: string
  ) {
    if (!file) throw new Error('No file provided');
    const result = await this.cloudinaryService.uploadImage(file, folder);
    return { message: 'Image uploaded successfully', data: result };
  }

  @Post('upload-images')
  @UseInterceptors(FilesInterceptor('files'))
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('folder') folder: string
  ) {
    if (!files || files.length === 0) throw new Error('No files provided');
    const result = await this.cloudinaryService.uploadImages(files, folder);
    return { message: 'Images uploaded successfully', data: result };
  }

  @Delete('delete-image')
  async deleteImage(@Query('publicId') publicId: string) {
    if (!publicId) throw new Error('publicId is required');
    const result = await this.cloudinaryService.deleteImage(publicId);
    return { message: 'Image deleted successfully', data: result };
  }

  @Delete('delete-images')
  async deleteImages(@Body('publicIds') publicIds: string[]) {
    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0)
      throw new Error('publicIds array is required');
    await this.cloudinaryService.deleteImages(publicIds);
    return { message: 'Images deleted successfully' };
  }
}

import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource, GalleryImageOptions } from '@capacitor/camera';

export type CapturedPhoto = {
  format: string | null;
  dataUrl?: string;
  webPath?: string;
};

@Injectable({
  providedIn: 'root',
})
export class CameraService {
  async takePhotoToDataUrl(quality = 70): Promise<CapturedPhoto> {
    const photo = await Camera.getPhoto({
      quality,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      saveToGallery: false,
      correctOrientation: true,
    });
    return {
      format: photo.format ?? null,
      dataUrl: photo.dataUrl ?? undefined,
    };
  }

  async takePhotoToFilePath(quality = 70): Promise<CapturedPhoto> {
    const photo = await Camera.getPhoto({
      quality,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      saveToGallery: false,
      correctOrientation: true,
    });
    return {
      format: photo.format ?? null,
      webPath: photo.webPath ?? undefined,
    };
  }
}



import { Injectable } from '@angular/core';
import * as tf from '@tensorflow/tfjs';
import type { io } from '@tensorflow/tfjs-core';

/**
 * Service for loading TensorFlow.js models from local assets
 */
@Injectable({
  providedIn: 'root',
})
export class TfjsModelLoaderService {
  /**
   * Creates an IO handler for loading models from local assets
   * @param modelPath Base path to the model directory (e.g., '/assets/models/movenet/singlepose-lightning')
   * @returns IO handler that can be used with TensorFlow.js model loading
   */
  createLocalIOHandler(modelPath: string): io.IOHandler {
    return {
      load: async () => {
        // Load model.json
        const modelJsonResponse = await fetch(`${modelPath}/model.json`);
        if (!modelJsonResponse.ok) {
          throw new Error(`Failed to load model.json from ${modelPath}`);
        }
        const modelJson = await modelJsonResponse.json();

        // Load weight files
        const weightManifest = modelJson.weightsManifest || [];
        const weightDataPromises: Promise<ArrayBuffer>[] = [];
        
        for (const manifest of weightManifest) {
          for (const path of manifest.paths) {
            const weightResponse = await fetch(`${modelPath}/${path}`);
            if (!weightResponse.ok) {
              throw new Error(`Failed to load weight file ${path} from ${modelPath}`);
            }
            weightDataPromises.push(weightResponse.arrayBuffer());
          }
        }

        const weightDataBuffers = await Promise.all(weightDataPromises);
        
        // Combine all weight buffers into a single Uint8Array
        const totalLength = weightDataBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
        const combinedWeights = new Uint8Array(totalLength);
        let offset = 0;
        for (const buf of weightDataBuffers) {
          combinedWeights.set(new Uint8Array(buf), offset);
          offset += buf.byteLength;
        }

        return {
          modelTopology: modelJson.modelTopology,
          weightSpecs: weightManifest.flatMap((m: any) => m.weights),
          weightData: combinedWeights,
        };
      },
    };
  }

  /**
   * Gets the local model URL for MoveNet models
   * @param modelType 'lightning' | 'thunder' | 'multipose'
   * @returns Local model URL path
   */
  getMoveNetModelUrl(modelType: 'lightning' | 'thunder' | 'multipose'): string {
    const pathMap: Record<string, string> = {
      lightning: '/assets/models/movenet/singlepose-lightning/model.json',
      thunder: '/assets/models/movenet/singlepose-thunder/model.json',
      multipose: '/assets/models/movenet/multipose-lightning/model.json',
    };
    return pathMap[modelType] || pathMap.lightning;
  }

  /**
   * Gets the local model URLs for BlazePose models
   * @param modelType 'lite' | 'full' | 'heavy'
   * @returns Object with detectorModelUrl and landmarkModelUrl
   */
  getBlazePoseModelUrls(modelType: 'lite' | 'full' | 'heavy'): {
    detectorModelUrl: string;
    landmarkModelUrl: string;
  } {
    const basePath = `/assets/models/blazepose/${modelType}`;
    return {
      detectorModelUrl: `${basePath}/detector/model.json`,
      landmarkModelUrl: `${basePath}/landmark/model.json`,
    };
  }

  /**
   * Checks if a local model exists at the given path
   * @param modelPath Path to model.json
   * @returns Promise that resolves to true if model exists, false otherwise
   */
  async checkModelExists(modelPath: string): Promise<boolean> {
    try {
      const response = await fetch(modelPath, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
}


// Type declarations for external libraries without types

declare module 'diffyjs' {
  export interface DiffyOptions {
    resolution: {
      x: number;
      y: number;
    };
    sensitivity: number;
    threshold: number;
    debug?: boolean;
    onFrame: (matrix: number[][]) => void;
  }

  export interface DiffyInstance {
    stop(): void;
  }

  export function create(options: DiffyOptions): DiffyInstance;
}

declare module 'speedy-vision' {
  const Speedy: {
    isSupported(): boolean;
    load(videoElement: HTMLVideoElement): Promise<any>;
    Pipeline(): any;
    Image: {
      Source(): any;
    };
    Filter: {
      Greyscale(): any;
      GaussianBlur(): any;
      Nightvision(): any;
    };
    Keypoint: {
      Detector: {
        Harris(): any;
      };
      Tracker: {
        LK(): any;
      };
      Sink(): any;
    };
    Size(width: number, height: number): any;
  };

  export default Speedy;
}

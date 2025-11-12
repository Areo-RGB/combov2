/**
 * TypeScript type definitions for diffyjs v2.0
 * Motion detection library for the browser
 * @see https://github.com/maniart/diffyjs
 */

declare module 'diffyjs' {
  /**
   * Configuration options for creating a Diffy instance
   */
  export interface DiffyOptions {
    /**
     * Resolution of the output matrix
     * Lower resolution = faster processing, less granularity
     * Example: { x: 15, y: 10 } creates a 15x10 matrix
     */
    resolution: {
      x: number;
      y: number;
    };

    /**
     * Sensitivity of motion detection (0-1 range)
     * Controls the blend amount between frames
     * Lower = more sensitive to subtle movements
     * Higher = only detects larger movements
     * Default: 0.2
     */
    sensitivity: number;

    /**
     * Threshold for motion detection (0-255 range)
     * Minimum average value to register as motion
     * Lower = detect more motion (more sensitive)
     * Higher = detect less motion (less sensitive)
     * Default: 25
     */
    threshold: number;

    /**
     * Enable debug mode to show diff canvas
     * When true, displays the motion detection visualization
     * Default: false
     */
    debug?: boolean;

    /**
     * CSS class name for the container element
     * Optional: Custom styling for the Diffy container
     */
    containerClassName?: string;

    /**
     * Source video dimensions
     * Optional: Specify custom dimensions for processing
     */
    sourceDimensions?: {
      w: number;
      h: number;
    };

    /**
     * Callback function executed on each frame
     * @param matrix - 2D array of motion intensity values (0-255)
     *                 Each cell represents average motion in that region
     */
    onFrame: (matrix: number[][]) => void;
  }

  /**
   * Diffy instance interface
   */
  export interface DiffyInstance {
    /**
     * Stop the motion detection and clean up resources
     */
    stop(): void;
  }

  /**
   * Create and initialize a Diffy motion detection instance
   * @param options - Configuration options
   * @returns Diffy instance with control methods
   */
  export function create(options: DiffyOptions): DiffyInstance;

  /**
   * Default export with create method
   */
  const Diffy: {
    create(options: DiffyOptions): DiffyInstance;
  };

  export default Diffy;
}

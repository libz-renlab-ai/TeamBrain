export type IsoTimestamp = string;

export interface Feature2Signal {
  readonly teammateId: string;
  readonly claudeInstanceId: string;
  readonly currentActivity: string;
  readonly capturedAt: IsoTimestamp;
}

export interface Feature3Signal {
  readonly recordingId: string;
  readonly storageUri: string;
  readonly durationSeconds: number;
  readonly uploadedAt: IsoTimestamp;
}

export interface LandingPayload {
  readonly schemaVersion: 1;
  readonly generatedAt: IsoTimestamp;
  readonly feature2: ReadonlyArray<Feature2Signal>;
  readonly feature3: ReadonlyArray<Feature3Signal>;
}

export interface LandingAdapter {
  collectFeature2(): Promise<ReadonlyArray<Feature2Signal>>;
  collectFeature3(): Promise<ReadonlyArray<Feature3Signal>>;
  buildPayload(now: () => Date): Promise<LandingPayload>;
}

export function createLandingAdapter(): LandingAdapter {
  return {
    async collectFeature2() {
      throw new Error("TODO(PR-3): wire AttributionBus second-level realtime stream");
    },
    async collectFeature3() {
      throw new Error("TODO(PR-3): wire video upload manifest from centralized storage");
    },
    async buildPayload(now) {
      throw new Error("TODO(PR-3): compose LandingPayload from feature2/feature3 collectors; now=" + now().toISOString());
    },
  };
}

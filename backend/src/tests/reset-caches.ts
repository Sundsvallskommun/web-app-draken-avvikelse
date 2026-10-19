// Vitest setupFiles, after setup.ts: the env is in place before the cache module loads.
// The BFF keeps Support Management's metadata for an hour across requests; a test that answers
// metadata with its own mock must not get another test's answer from that cache.
import { supportMetadataCache } from '@/services/support-metadata-cache';

beforeEach(() => {
  supportMetadataCache.clear();
});

import { getMetadataArgsStorage } from 'routing-controllers';

import { CONTROLLERS } from '@/controllers';

describe('the registered controllers', () => {
  const registered = new Set<unknown>(CONTROLLERS);
  const storage = getMetadataArgsStorage();

  // The BFF serves one municipality, read from its own MUNICIPALITY_ID. A route that took one from the client would let
  // the client choose which municipality the APIs are asked about.
  it('take no municipality from the client, in the path or anywhere else', () => {
    const actions = storage.actions.filter(action => registered.has(action.target));
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.filter(action => String(action.route).toLowerCase().includes('municipality')).map(action => action.route)).toEqual([]);
    expect(
      storage.params
        .filter(param => registered.has(param.object.constructor) && param.name?.toLowerCase().includes('municipality'))
        .map(param => `${param.object.constructor.name}.${param.method}(${param.name})`),
    ).toEqual([]);
  });
});

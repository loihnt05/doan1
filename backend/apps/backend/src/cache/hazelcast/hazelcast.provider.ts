import { Client } from 'hazelcast-client';

export const HAZELCAST = 'HAZELCAST_CLIENT';

export const hazelcastProvider = {
  provide: HAZELCAST,
  useFactory: async () => {
    const client = await Client.newHazelcastClient({
      clusterName: 'dev',
      network: {
        clusterMembers: ['localhost:5701'],
      },
    });
    return client;
  },
};

export const ConfigProvider = {
  provide: 'CONFIG',
  useFactory: () => {
    return {
      apiKey: process.env.API_KEY || 'default-api-key',
      featureFlag: true,
    };
  },
};

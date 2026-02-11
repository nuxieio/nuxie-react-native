import { AndroidConfig, type ConfigPlugin, withAndroidManifest, withInfoPlist } from "@expo/config-plugins";

export type NuxiePluginOptions = {
  apiKey?: string;
};

const withNuxieApiKey: ConfigPlugin<NuxiePluginOptions> = (config, options = {}) => {
  if (typeof options.apiKey !== "string" || options.apiKey.length === 0) {
    return config;
  }

  config = withInfoPlist(config, (nextConfig) => {
    nextConfig.modResults.NUXIE_API_KEY = options.apiKey;
    return nextConfig;
  });

  config = withAndroidManifest(config, (nextConfig) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(nextConfig.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(mainApplication, "NUXIE_API_KEY", options.apiKey!);
    return nextConfig;
  });

  return config;
};

export default withNuxieApiKey;

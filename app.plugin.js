const { AndroidConfig, withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

function withNuxieApiKey(config, options = {}) {
  const apiKey = options.apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return config;
  }

  config = withInfoPlist(config, (config) => {
    config.modResults.NUXIE_API_KEY = apiKey;
    return config;
  });

  config = withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(mainApplication, "NUXIE_API_KEY", apiKey);
    return config;
  });

  return config;
}

module.exports = withNuxieApiKey;

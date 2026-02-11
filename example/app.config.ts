import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiKey = process.env.NUXIE_EXAMPLE_API_KEY ?? "NX_EXAMPLE_API_KEY";

  return {
    ...config,
    name: "Nuxie React Native Example",
    slug: "nuxie-react-native-example",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    ios: {
      bundleIdentifier: "io.nuxie.example.rn",
    },
    android: {
      package: "io.nuxie.example.rn",
    },
    plugins: [["@nuxie/react-native/plugin", { apiKey }]],
    extra: {
      nuxieExampleApiKey: apiKey,
    },
  };
};

// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The Anthropic SDK's ES-module build has circular imports that fail to
// initialise under Metro ("Cannot access ... before initialization").
// Resolve it through its CommonJS build instead, which handles the cycles.
const SDK = '@anthropic-ai/sdk';
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  if (moduleName === SDK || moduleName.startsWith(`${SDK}/`)) {
    return resolve({ ...context, isESMImport: false }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;

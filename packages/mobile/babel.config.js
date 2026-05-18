module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated/plugin MUSS das LETZTE Plugin sein.
    // Phase B1 (2026-05-18): added für react-native-draggable-flatlist.
    plugins: ['react-native-reanimated/plugin'],
  };
};

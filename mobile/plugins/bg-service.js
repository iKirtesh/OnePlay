const { withAndroidManifest } = require('expo/config-plugins');
// Android 14 needs the foreground service to declare its type in the manifest.
module.exports = (config) => withAndroidManifest(config, (c) => {
  const m = c.modResults.manifest;
  m.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const app = m.application[0];
  app.service = (app.service || []).filter((s) => s.$['android:name'] !== 'com.asterinet.react.bgactions.RNBackgroundActionsTask');
  app.service.push({ $: { 'android:name': 'com.asterinet.react.bgactions.RNBackgroundActionsTask', 'android:foregroundServiceType': 'dataSync', 'tools:node': 'merge' } });
  return c;
});

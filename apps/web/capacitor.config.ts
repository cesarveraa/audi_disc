import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.audidisc.admin',
  appName: 'Audi Disc Admin',
  webDir: '../../dist',
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#0A0A0A',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;

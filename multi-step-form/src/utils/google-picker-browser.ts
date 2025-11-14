// Google Picker API Service for file selection UI (Browser-compatible)
import { simpleGoogleAuth } from './google-auth-simple';

const GOOGLE_API_KEY = 'AIzaSyBBl3eCvwqDvDUm4aFUyE0JNYUu9ox2Tjo';

export interface PickerFile {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes?: number;
  lastEditedUtc?: number;
}

export interface PickerResponse {
  action: string;
  docs?: PickerFile[];
}

export class GooglePickerService {
  private static instance: GooglePickerService;
  private pickerApiLoaded: boolean = false;
  
  private constructor() {}

  static getInstance(): GooglePickerService {
    if (!GooglePickerService.instance) {
      GooglePickerService.instance = new GooglePickerService();
    }
    return GooglePickerService.instance;
  }

  // Initialize Google Picker API
  async initializePicker(): Promise<boolean> {
    try {
      if (this.pickerApiLoaded) {
        return true;
      }

      // Ensure both GIS and GAPI are loaded
      if (!simpleGoogleAuth.isGapiAvailable() || !window.google) {
        console.log('Google APIs not available, initializing...');
        await simpleGoogleAuth.initialize();
      }

      // Load the Picker API
      await new Promise<void>((resolve, reject) => {
        window.gapi.load('picker', {
          callback: () => {
            console.log('Google Picker API loaded successfully');
            this.pickerApiLoaded = true;
            resolve();
          },
          onerror: () => {
            reject(new Error('Failed to load Google Picker API'));
          }
        });
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize Google Picker:', error);
      return false;
    }
  }

  // Show Google Forms picker dialog
  async showFormsPicker(): Promise<PickerFile | null> {
    try {
      if (!simpleGoogleAuth.isAuthenticated()) {
        throw new Error('User not authenticated. Please sign in to Google first.');
      }

      if (!this.pickerApiLoaded) {
        const initialized = await this.initializePicker();
        if (!initialized) {
          throw new Error('Failed to initialize Google Picker');
        }
      }

      const accessToken = simpleGoogleAuth.getAccessToken();
      if (!accessToken) {
        throw new Error('No access token available');
      }

      return new Promise((resolve, reject) => {
        try {
          const picker = new window.google.picker.PickerBuilder()
            // Add Google Forms view
            .addView(new window.google.picker.DocsView(window.google.picker.ViewId.FORMS)
              .setIncludeFolders(true)
              .setSelectFolderEnabled(false))
            // Add recent documents view for easier access
            .addView(new window.google.picker.DocsView()
              .setIncludeFolders(false)
              .setMimeTypes('application/vnd.google-apps.form')
              .setSelectFolderEnabled(false))
            .setOAuthToken(accessToken)
            .setDeveloperKey(GOOGLE_API_KEY)
            .setCallback((data: PickerResponse) => {
              if (data.action === window.google.picker.Action.PICKED) {
                const file = data.docs?.[0];
                if (file) {
                  console.log('File selected from picker:', file.name);
                  resolve(file);
                } else {
                  resolve(null);
                }
              } else if (data.action === window.google.picker.Action.CANCEL) {
                console.log('Picker dialog cancelled');
                resolve(null);
              }
            })
            .setTitle('Select a Google Form')
            .setSize(1051, 650)
            .build();

          picker.setVisible(true);
        } catch (pickerError: any) {
          console.error('Error creating picker:', pickerError);
          reject(pickerError);
        }
      });
    } catch (error: any) {
      console.error('Error showing forms picker:', error);
      throw error;
    }
  }

  // Show custom picker with filters
  async showCustomPicker(options: {
    title?: string;
    mimeTypes?: string[];
    multiselect?: boolean;
  } = {}): Promise<PickerFile[]> {
    try {
      if (!simpleGoogleAuth.isAuthenticated()) {
        throw new Error('User not authenticated');
      }

      if (!this.pickerApiLoaded) {
        await this.initializePicker();
      }

      const accessToken = simpleGoogleAuth.getAccessToken();
      if (!accessToken) {
        throw new Error('No access token available');
      }

      const {
        title = 'Select Files',
        mimeTypes = ['application/vnd.google-apps.form'],
        multiselect = false
      } = options;

      return new Promise((resolve, reject) => {
        try {
          let view = new window.google.picker.DocsView();
          
          if (mimeTypes.length > 0) {
            view = view.setMimeTypes(mimeTypes.join(','));
          }

          let builder = new window.google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(accessToken)
            .setDeveloperKey(GOOGLE_API_KEY)
            .setCallback((data: PickerResponse) => {
              if (data.action === window.google.picker.Action.PICKED) {
                const files = data.docs || [];
                resolve(files);
              } else if (data.action === window.google.picker.Action.CANCEL) {
                resolve([]);
              }
            })
            .setTitle(title);

          if (multiselect) {
            builder = builder.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
          }

          const picker = builder.build();
          picker.setVisible(true);
        } catch (pickerError: any) {
          reject(pickerError);
        }
      });
    } catch (error: any) {
      console.error('Error showing custom picker:', error);
      throw error;
    }
  }

  // Extract form ID from picker file
  extractFormId(pickerFile: PickerFile): string {
    // The file ID from picker is the form ID
    return pickerFile.id;
  }

  // Convert picker file to form URL
  getFormUrl(pickerFile: PickerFile): string {
    return `https://docs.google.com/forms/d/${pickerFile.id}/viewform`;
  }

  // Check if picker API is available
  isPickerAvailable(): boolean {
    return typeof window !== 'undefined' && 
           !!window.google && 
           !!window.google.picker &&
           this.pickerApiLoaded;
  }

  // Preload picker for faster access
  async preloadPicker(): Promise<void> {
    try {
      if (!this.pickerApiLoaded) {
        await this.initializePicker();
      }
    } catch (error) {
      console.error('Error preloading picker:', error);
    }
  }
}

// Singleton instance
export const googlePicker = GooglePickerService.getInstance();
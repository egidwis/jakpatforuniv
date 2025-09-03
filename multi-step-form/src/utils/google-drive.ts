// Google Drive API Service
import { googleAuth } from './google-auth';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
}

export interface GoogleDriveResponse {
  success: boolean;
  files?: GoogleDriveFile[];
  error?: string;
}

export class GoogleDriveService {
  private static instance: GoogleDriveService;
  
  private constructor() {}

  static getInstance(): GoogleDriveService {
    if (!GoogleDriveService.instance) {
      GoogleDriveService.instance = new GoogleDriveService();
    }
    return GoogleDriveService.instance;
  }

  // List Google Forms from user's Drive
  async listGoogleForms(): Promise<GoogleDriveResponse> {
    try {
      if (!googleAuth.isSignedIn()) {
        return {
          success: false,
          error: 'User not authenticated. Please sign in to Google first.'
        };
      }

      console.log('Fetching Google Forms from Drive...');

      // Query for Google Forms only
      const query = "mimeType='application/vnd.google-apps.form' and trashed=false";
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,createdTime,modifiedTime,size)&orderBy=modifiedTime desc`;

      const response = await googleAuth.makeAuthenticatedRequest(url);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      
      console.log(`Found ${data.files?.length || 0} Google Forms`);

      return {
        success: true,
        files: data.files || []
      };
    } catch (error: any) {
      console.error('Error fetching Google Forms:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch Google Forms'
      };
    }
  }

  // Get specific file details
  async getFile(fileId: string): Promise<GoogleDriveFile | null> {
    try {
      if (!googleAuth.isSignedIn()) {
        throw new Error('User not authenticated');
      }

      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink,createdTime,modifiedTime,size`;
      
      const response = await googleAuth.makeAuthenticatedRequest(url);
      
      if (!response.ok) {
        throw new Error(`Failed to get file: ${response.status}`);
      }

      const file = await response.json();
      return file;
    } catch (error) {
      console.error('Error getting file:', error);
      return null;
    }
  }

  // Convert Google Form file ID to viewable URL
  getFormUrl(fileId: string): string {
    return `https://docs.google.com/forms/d/${fileId}/edit`;
  }

  // Convert to public view URL for form filling
  getFormViewUrl(fileId: string): string {
    return `https://docs.google.com/forms/d/${fileId}/viewform`;
  }

  // Check if file is accessible
  async isFileAccessible(fileId: string): Promise<boolean> {
    try {
      const file = await this.getFile(fileId);
      return !!file;
    } catch (error) {
      console.error('Error checking file accessibility:', error);
      return false;
    }
  }

  // Search for forms by name
  async searchForms(searchTerm: string): Promise<GoogleDriveResponse> {
    try {
      if (!googleAuth.isSignedIn()) {
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      const query = `mimeType='application/vnd.google-apps.form' and trashed=false and name contains '${searchTerm}'`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,createdTime,modifiedTime)&orderBy=modifiedTime desc`;

      const response = await googleAuth.makeAuthenticatedRequest(url);

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        files: data.files || []
      };
    } catch (error: any) {
      console.error('Error searching forms:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get recent forms (last 30 days)
  async getRecentForms(limit: number = 20): Promise<GoogleDriveResponse> {
    try {
      if (!googleAuth.isSignedIn()) {
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      // Get forms modified in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateString = thirtyDaysAgo.toISOString();

      const query = `mimeType='application/vnd.google-apps.form' and trashed=false and modifiedTime >= '${dateString}'`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,createdTime,modifiedTime)&orderBy=modifiedTime desc&pageSize=${limit}`;

      const response = await googleAuth.makeAuthenticatedRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to get recent forms: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        files: data.files || []
      };
    } catch (error: any) {
      console.error('Error getting recent forms:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Singleton instance
export const googleDrive = GoogleDriveService.getInstance();
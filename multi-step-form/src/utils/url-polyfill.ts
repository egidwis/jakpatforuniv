/**
 * Polyfill sederhana untuk URL API
 * Digunakan sebagai fallback jika URL constructor tidak tersedia atau error
 */

export class URLPolyfill {
  href: string;
  protocol: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;

  constructor(url: string, base?: string) {
    // Default values
    this.href = url || 'https://submit.jakpatforuniv.com';
    this.protocol = 'https:';
    this.host = 'submit.jakpatforuniv.com';
    this.hostname = 'submit.jakpatforuniv.com';
    this.port = '';
    this.pathname = '/';
    this.search = '';
    this.hash = '';
    this.origin = 'https://submit.jakpatforuniv.com';

    // Try to parse the URL if it's valid
    if (url && typeof url === 'string') {
      try {
        // Simple URL parsing with regex
        const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
        if (urlRegex.test(url)) {
          if (url.startsWith('http://') || url.startsWith('https://')) {
            this.href = url;
          } else {
            this.href = 'https://' + url;
          }

          // Extract protocol
          const protocolMatch = this.href.match(/^(https?:)\/\//);
          if (protocolMatch) {
            this.protocol = protocolMatch[1];
          }

          // Extract hostname
          const hostnameMatch = this.href.match(/^https?:\/\/([^\/]+)/);
          if (hostnameMatch) {
            this.hostname = hostnameMatch[1];
            this.host = this.hostname;
          }

          // Extract origin
          this.origin = `${this.protocol}//${this.hostname}`;

          // Extract pathname
          const pathnameMatch = this.href.match(/^https?:\/\/[^\/]+(\/[^?#]*)/);
          if (pathnameMatch) {
            this.pathname = pathnameMatch[1];
          } else {
            this.pathname = '/';
          }

          // Extract search
          const searchMatch = this.href.match(/\?([^#]*)/);
          if (searchMatch) {
            this.search = '?' + searchMatch[1];
          }

          // Extract hash
          const hashMatch = this.href.match(/#(.*)/);
          if (hashMatch) {
            this.hash = '#' + hashMatch[1];
          }
        }
      } catch (error) {
        console.warn('Error parsing URL:', error);
      }
    }
  }

  toString(): string {
    return this.href;
  }

  toJSON(): string {
    return this.href;
  }
}

// Polyfill for URLSearchParams
export class URLSearchParamsPolyfill {
  private params: Map<string, string>;

  constructor(init?: string | Record<string, string> | URLSearchParamsPolyfill) {
    this.params = new Map();

    if (init) {
      if (typeof init === 'string') {
        // Parse from string
        const query = init.startsWith('?') ? init.substring(1) : init;
        const pairs = query.split('&');
        for (const pair of pairs) {
          const [key, value] = pair.split('=');
          if (key) {
            this.append(decodeURIComponent(key), value ? decodeURIComponent(value) : '');
          }
        }
      } else if (init instanceof URLSearchParamsPolyfill) {
        // Copy from another URLSearchParams
        init.forEach((value, key) => {
          this.append(key, value);
        });
      } else {
        // Initialize from object
        for (const key in init) {
          if (Object.prototype.hasOwnProperty.call(init, key)) {
            this.append(key, init[key]);
          }
        }
      }
    }
  }

  append(name: string, value: string): void {
    this.params.set(name, value);
  }

  delete(name: string): void {
    this.params.delete(name);
  }

  get(name: string): string | null {
    return this.params.has(name) ? this.params.get(name) || '' : null;
  }

  getAll(name: string): string[] {
    return this.params.has(name) ? [this.params.get(name) || ''] : [];
  }

  has(name: string): boolean {
    return this.params.has(name);
  }

  set(name: string, value: string): void {
    this.params.set(name, value);
  }

  forEach(callback: (value: string, key: string) => void): void {
    this.params.forEach((value, key) => {
      callback(value, key);
    });
  }

  toString(): string {
    const pairs: string[] = [];
    this.params.forEach((value, key) => {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    });
    return pairs.join('&');
  }
}

// Install polyfills if needed
export function installURLPolyfills(): void {
  if (typeof window !== 'undefined') {
    try {
      // Test if URL constructor works
      new window.URL('https://example.com');
    } catch (error) {
      console.warn('URL constructor not working, installing polyfill');
      // @ts-ignore
      window.URL = URLPolyfill;
    }

    try {
      // Test if URLSearchParams constructor works
      new window.URLSearchParams('a=1');
    } catch (error) {
      console.warn('URLSearchParams constructor not working, installing polyfill');
      // @ts-ignore
      window.URLSearchParams = URLSearchParamsPolyfill;
    }
  }
}

export default {
  URL: URLPolyfill,
  URLSearchParams: URLSearchParamsPolyfill,
  installURLPolyfills
};

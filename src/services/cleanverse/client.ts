import { config } from '../../config';
import { logger } from '../../config';
import { CleanverseResponse } from './types';

// Endpoints that require AES encryption
const ENCRYPTED_ENDPOINTS = [
  '/generate_apass',
  '/update_status',
  '/atoken/register_atoken',
  '/atoken/launch',
  '/atoken/register_wrapped_atoken',
  '/atoken/launch_wrapped_atoken',
  '/atoken/add_rule',
  '/atoken/remove_rule',
  '/atoken/set_paused',
  '/atoken/add_whitelist_for_institutional',
  '/atoken/remove_whitelist_for_institutional',
  '/atoken/restore_whitelist_for_institutional',
  '/blacklist/add',
  '/validator/grant',
  '/validator/register',
  '/validator/set_rule',
  '/validator/add_rule',
  '/validator/remove_rule',
  '/validator/set_paused',
];

export class CleanverseClient {
  private baseUrl: string;
  private apiId: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.CLEANVERSE_BASE_URL;
    this.apiId = config.CLEANVERSE_API_ID;
    this.apiKey = config.CLEANVERSE_API_KEY;
  }

  /**
   * AES Encryption for request bodies
   * Algorithm: AES/CBC/PKCS5Padding
   * IV: 16 zero bytes
   * Key: Base64-encoded api-key
   */
  private async encrypt(data: object): Promise<string> {
    const crypto = await import('crypto');
    const key = Buffer.from(this.apiKey, 'base64');
    const iv = Buffer.alloc(16, 0);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return encrypted;
  }

  /**
   * AES Decryption for response bodies
   */
  private async decrypt(encryptedData: string): Promise<any> {
    const crypto = await import('crypto');
    const key = Buffer.from(this.apiKey, 'base64');
    const iv = Buffer.alloc(16, 0);
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Check if endpoint requires encryption
   */
  private requiresEncryption(endpoint: string): boolean {
    return ENCRYPTED_ENDPOINTS.some(ep => endpoint.includes(ep));
  }

  /**
   * Make HTTP request to Cleanverse API
   * @param encrypt - Override encryption (true = encrypt if required, false = never encrypt)
   */
  async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: object,
    encrypt?: boolean
  ): Promise<CleanverseResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'api-id': this.apiId,
    };

    let requestBody: string | undefined;
    let responseBody: CleanverseResponse<T>;

    try {
      if (body) {
        // Use explicit encrypt flag, or check endpoint if not specified
        const shouldEncrypt = encrypt !== undefined ? encrypt : this.requiresEncryption(endpoint);
        if (shouldEncrypt) {
          // Encrypt request body
          const encrypted = await this.encrypt(body);
          requestBody = JSON.stringify({ data: encrypted });
          logger.debug({ 
            endpoint, 
            encrypted: true,
            requestBodyPreview: JSON.stringify(body).substring(0, 500) 
          }, 'Cleanverse encrypted request');
        } else {
          requestBody = JSON.stringify(body);
          logger.info({
            endpoint,
            requestBodyPreview: JSON.stringify(body).substring(0, 500),
          }, 'Cleanverse plain request');
        }
      }

      logger.info({ method, url, endpoint }, 'Cleanverse API request');

      const response = await fetch(url, {
        method,
        headers,
        body: requestBody,
      });

      const rawResponse = await response.text();
      console.log(rawResponse)
      // Try parsing as encrypted response first
      try {
        const parsed = JSON.parse(rawResponse);
        if (parsed.data && typeof parsed.data === 'string') {
          // Decrypt response
          const decrypted = await this.decrypt(parsed.data);
          console.log(decrypted)
          responseBody = {
            code: parsed.code,
            message: parsed.message,
            data: decrypted,
          };
          logger.debug({ endpoint, decrypted: true }, 'Cleanverse decrypted response');
        } else {
          responseBody = parsed;
        }
      } catch {
        // Response is not JSON or not encrypted
        responseBody = JSON.parse(rawResponse);
      }

      logger.info({ 
        code: responseBody.code, 
        message: responseBody.message,
        endpoint 
      }, 'Cleanverse API response');

      return responseBody;
    } catch (error) {
      logger.error({ error, endpoint }, 'Cleanverse API error');
      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string): Promise<CleanverseResponse<T>> {
    return this.request<T>('GET', endpoint);
  }

  /**
   * POST request
   * @param encrypt - Set to false for endpoints that don't require encryption (default: true)
   */
  async post<T>(endpoint: string, body?: object, encrypt?: boolean): Promise<CleanverseResponse<T>> {
    return this.request<T>('POST', endpoint, body, encrypt);
  }

  /**
   * Check if response is success
   */
  isSuccess(response: CleanverseResponse): boolean {
    return response.code === '0000';
  }

  /**
   * Parse error from response
   */
  getError(response: CleanverseResponse): string {
    return response.message || 'Unknown error';
  }
}

// Singleton instance
let clientInstance: CleanverseClient | null = null;

export function getCleanverseClient(): CleanverseClient {
  if (!clientInstance) {
    clientInstance = new CleanverseClient();
  }
  return clientInstance;
}

export default getCleanverseClient;

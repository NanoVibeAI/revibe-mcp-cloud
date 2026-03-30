export interface StorageProvider {
  upload(params: {
    filePath: string;
    content: Buffer;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string>;

  download(filePath: string): Promise<Buffer>;
  delete(filePath: string): Promise<boolean>;
  exists(filePath: string): Promise<boolean>;
  listFiles(prefix?: string): Promise<Array<Record<string, unknown>>>;
  getSignedUrl(filePath: string, expiresIn?: number): Promise<string>;
}

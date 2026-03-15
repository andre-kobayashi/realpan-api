import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

export interface ProcessImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

/**
 * Processa imagem: redimensiona e converte para WebP
 * 
 * Exemplos:
 * - Upload PNG 5MB 4000x3000 → WebP 200KB 1200x900
 * - Upload JPEG 2MB 2000x2000 → WebP 150KB 1000x1000
 */
export class ImageProcessor {
  private publicDir: string;

  constructor(publicDir: string = './public/products') {
    this.publicDir = publicDir;
  }

  /**
   * Processa imagem para produto
   * @param buffer Buffer da imagem original
   * @param options Opções de processamento
   * @returns Nome do arquivo WebP gerado
   */
  async processProductImage(
    buffer: Buffer,
    options: ProcessImageOptions = {}
  ): Promise<string> {
    const {
      maxWidth = 1200,
      maxHeight = 1200,
      quality = 85,
    } = options;

    // Gerar nome único
    const filename = `${randomUUID()}.webp`;
    const filepath = path.join(this.publicDir, filename);

    // Garantir que diretório existe
    await fs.mkdir(this.publicDir, { recursive: true });

    // Processar imagem
    await sharp(buffer)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toFile(filepath);

    return filename;
  }

  /**
   * Cria múltiplos tamanhos de uma imagem
   * @param buffer Buffer da imagem original
   * @returns Objeto com URLs de diferentes tamanhos
   */
  async processMultipleSizes(
    buffer: Buffer
  ): Promise<{ original: string; medium: string; thumb: string }> {
    const uuid = randomUUID();
    
    await fs.mkdir(this.publicDir, { recursive: true });

    // Original (1200x1200 max)
    const original = `${uuid}.webp`;
    await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toFile(path.join(this.publicDir, original));

    // Medium (600x600 max)
    const medium = `${uuid}-medium.webp`;
    await sharp(buffer)
      .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(this.publicDir, medium));

    // Thumbnail (200x200 max)
    const thumb = `${uuid}-thumb.webp`;
    await sharp(buffer)
      .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(this.publicDir, thumb));

    return { original, medium, thumb };
  }

  /**
   * Remove imagem do disco
   */
  async deleteImage(filename: string): Promise<void> {
    const filepath = path.join(this.publicDir, filename);
    try {
      await fs.unlink(filepath);
    } catch (error) {
      console.warn(`Falha ao deletar imagem ${filename}:`, error);
    }
  }

  /**
   * Remove múltiplas imagens
   */
  async deleteImages(filenames: string[]): Promise<void> {
    await Promise.allSettled(
      filenames.map(filename => this.deleteImage(filename))
    );
  }
}

export const imageProcessor = new ImageProcessor();

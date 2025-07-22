import { pipeline, env } from '@xenova/transformers';
import { IndexFlatIP } from 'faiss-node';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper constants for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure transformers.js to use local models
env.allowLocalModels = false;
env.allowRemoteModels = true;

interface ApiMetadata {
  path: string;
  description: string;
  parameters: string[];
  method?: string;
  tags?: string[];
  summary?: string;
}

interface SearchResult {
  id: string;
  metadata: ApiMetadata;
  relevanceScore: number;
}

export class LightweightSemanticSearch {
  private model: any = null;
  private vectorDb: IndexFlatIP | null = null;
  private apiMetadata: Map<string, ApiMetadata> = new Map();
  private isInitialized: boolean = false;
  private readonly dimensions: number = 384; // all-MiniLM-L6-v2 dimensions
  private readonly modelName: string = 'Xenova/all-MiniLM-L6-v2';
  private readonly indexPath: string;
  private readonly metadataPath: string;

  constructor() {
    // Set up storage paths
    const storageDir = path.join(__dirname, 'embeddings-cache');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    
    this.indexPath = path.join(storageDir, 'faiss-index.bin');
    this.metadataPath = path.join(storageDir, 'metadata.json');
  }

  /**
   * Initialize the semantic search system
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔄 Initializing semantic search system...');
      
      // Initialize the embedding model
      console.log(`📥 Loading model: ${this.modelName}`);
      this.model = await pipeline('feature-extraction', this.modelName, {
        quantized: false,
      });
      
      // Initialize FAISS index
      this.vectorDb = new IndexFlatIP(this.dimensions);
      
      // Try to load existing index and metadata
      await this.loadIndex();
      
      this.isInitialized = true;
      console.log('✅ Semantic search system initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize semantic search:', error);
      throw new Error(`Semantic search initialization failed: ${error}`);
    }
  }

  /**
   * Check if the system is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.model || !this.vectorDb) {
      throw new Error('Semantic search system not initialized. Call initialize() first.');
    }
  }

  /**
   * Create embeddings for text
   */
  private async createEmbedding(text: string): Promise<Float32Array> {
    try {
      const output = await this.model(text, {
        pooling: 'mean',
        normalize: true,
      });
      
      // Convert to Float32Array for FAISS
      return new Float32Array(output.data);
      
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw new Error(`Failed to create embedding: ${error}`);
    }
  }

  /**
   * Index an API endpoint for semantic search
   */
  async indexAPI(
    apiId: string, 
    path: string, 
    description: string, 
    parameters: string[],
    method?: string,
    tags?: string[],
    summary?: string
  ): Promise<void> {
    this.ensureInitialized();

    try {
      // Create rich text representation for embedding
      const textParts = [
        path,
        summary || '',
        description || '',
        parameters.join(' '),
        tags?.join(' ') || '',
        method || ''
      ].filter(part => part.trim().length > 0);
      
      const richText = textParts.join(' ');
      
      // Create embedding
      const embedding = await this.createEmbedding(richText);
      
      // Add to FAISS index
      this.vectorDb!.add(embedding);
      
      // Store metadata
      const metadata: ApiMetadata = {
        path,
        description: description || '',
        parameters,
        method,
        tags,
        summary
      };
      
      this.apiMetadata.set(apiId, metadata);
      
      console.log(`📝 Indexed API: ${method || 'GET'} ${path}`);
      
    } catch (error) {
      console.error(`Failed to index API ${apiId}:`, error);
      throw error;
    }
  }

  /**
   * Search for APIs using semantic similarity
   */
  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    this.ensureInitialized();

    try {
      if (this.apiMetadata.size === 0) {
        console.log('⚠️ No APIs indexed yet');
        return [];
      }

      // Create query embedding
      const queryEmbedding = await this.createEmbedding(query);
      
      // Search in FAISS index
      const searchResults = this.vectorDb!.search(queryEmbedding, Math.min(topK, this.apiMetadata.size));
      
      // Map results to metadata
      const results: SearchResult[] = [];
      const apiIds = Array.from(this.apiMetadata.keys());
      
      for (let i = 0; i < searchResults.labels.length; i++) {
        const index = searchResults.labels[i];
        const score = searchResults.distances[i];
        
        if (index < apiIds.length) {
          const apiId = apiIds[index];
          const metadata = this.apiMetadata.get(apiId);
          
          if (metadata) {
            results.push({
              id: apiId,
              metadata,
              relevanceScore: score
            });
          }
        }
      }
      
      // Sort by relevance score (higher is better for inner product)
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      return results;
      
    } catch (error) {
      console.error('Search failed:', error);
      throw new Error(`Semantic search failed: ${error}`);
    }
  }

  /**
   * Save the current index and metadata to disk
   */
  async saveIndex(): Promise<void> {
    try {
      if (!this.vectorDb || this.apiMetadata.size === 0) {
        console.log('⚠️ No data to save');
        return;
      }

      // Save FAISS index
      this.vectorDb.write(this.indexPath);
      
      // Save metadata
      const metadataObj = Object.fromEntries(this.apiMetadata);
      fs.writeFileSync(this.metadataPath, JSON.stringify(metadataObj, null, 2));
      
      console.log(`💾 Saved index with ${this.apiMetadata.size} APIs`);
      
    } catch (error) {
      console.error('Failed to save index:', error);
      throw error;
    }
  }

  /**
   * Load existing index and metadata from disk
   */
  async loadIndex(): Promise<void> {
    try {
      // Load metadata if exists
      if (fs.existsSync(this.metadataPath)) {
        const metadataContent = fs.readFileSync(this.metadataPath, 'utf-8');
        const metadataObj = JSON.parse(metadataContent);
        this.apiMetadata = new Map(Object.entries(metadataObj));
        console.log(`📂 Loaded metadata for ${this.apiMetadata.size} APIs`);
      }

      // Load FAISS index if exists and has data
      if (fs.existsSync(this.indexPath) && this.apiMetadata.size > 0) {
        this.vectorDb = IndexFlatIP.read(this.indexPath);
        console.log(`📂 Loaded FAISS index with ${this.vectorDb.ntotal()} vectors`);
      }
      
    } catch (error) {
      console.warn('Could not load existing index, starting fresh:', error);
      // Reset to fresh state
      this.vectorDb = new IndexFlatIP(this.dimensions);
      this.apiMetadata.clear();
    }
  }

  /**
   * Clear all indexed data
   */
  async clearIndex(): Promise<void> {
    this.apiMetadata.clear();
    this.vectorDb = new IndexFlatIP(this.dimensions);
    
    // Remove saved files
    try {
      if (fs.existsSync(this.indexPath)) {
        fs.unlinkSync(this.indexPath);
      }
      if (fs.existsSync(this.metadataPath)) {
        fs.unlinkSync(this.metadataPath);
      }
      console.log('🗑️ Cleared all indexed data');
    } catch (error) {
      console.warn('Could not remove index files:', error);
    }
  }

  /**
   * Get statistics about the indexed data
   */
  getStats(): { totalApis: number; isInitialized: boolean; modelName: string } {
    return {
      totalApis: this.apiMetadata.size,
      isInitialized: this.isInitialized,
      modelName: this.modelName
    };
  }
}
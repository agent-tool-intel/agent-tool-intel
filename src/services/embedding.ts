import OpenAI from "openai";

// Aliyun DashScope — OpenAI-compatible embedding endpoint
const openai = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

// text-embedding-v4: latest, 1536 dims, matches pgvector schema
const EMBEDDING_MODEL = "text-embedding-v4";

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0]!.embedding;
}

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  return response.data.map((d) => d.embedding);
}

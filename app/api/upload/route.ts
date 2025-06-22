import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import slugify from "slugify";
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Configure body size limit for this route
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
  },
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// 初始化 Supabase 客户端
const supabase = createClient(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 初始化 S3 客户端
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const encoder = new TextEncoder();

function createStreamResponse(cb: (stream: {
  sendEvent: (data: object) => void;
  close: () => void;
}) => Promise<void>) {
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const close = () => {
        controller.close();
      };

      try {
        await cb({ sendEvent, close });
      } catch (err) {
        console.error("Stream callback error:", err);
        sendEvent({ status: 'error', message: (err as Error).message });
        close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// 生成 R2 文件的公共访问 URL (现在只返回相对路径)
function getR2PublicUrl(key: string): string {
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  if (!publicDomain) {
    // Return relative path if public domain is not set
    return key;
  }
  return `${publicDomain}/${key}`;
}

// Define a helper function to run the Python script
function runPythonConverter(
  inputPath: string,
  outputPath: string
): Promise<{ previews: string[]; thumbnails: string[] }> {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [
      './convert.py', // Path to the script
      inputPath,
      outputPath,
    ]);

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          // The last line of stdout should be our JSON
          const lines = stdoutData.trim().split('\n');
          const jsonOutput = lines[lines.length - 1];
          const result = JSON.parse(jsonOutput);
          resolve(result);
        } catch (error) {
           reject(new Error(`Failed to parse Python script output. Raw stdout: ${stdoutData}. Stderr: ${stderrData}`));
        }
      } else {
        reject(new Error(`Python script exited with code ${code}. Error: ${stderrData}`));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start Python script: ${err.message}`));
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    return createStreamResponse(async ({ sendEvent, close }) => {
      let tempDir: string | null = null;
      try {
        const file = formData.get("file") as File;
        const title = formData.get("title") as string;
        const description = formData.get("description") as string;
        const category = formData.get("category") as string;
        const subcategory = formData.get("subcategory") as string;
        const tags = (formData.get("tags") as string) || "";

        if (!file) {
          throw new Error("文件未上传。");
        }

        // Check file size (100MB limit)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
          throw new Error(`文件大小超过限制。最大允许 100MB，当前文件大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
        }

        if (!title || !category) {
          throw new Error("标题和分类是必填项。");
        }

        sendEvent({ status: 'info', message: '数据校验完成，开始处理文件...' });

        // 1. Create a unique temporary directory
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ppt-upload-'));
        sendEvent({ status: 'info', message: `创建临时目录: ${path.basename(tempDir)}` });
        
        const tempFilePath = path.join(tempDir, file.name);
        const scriptOutputDir = path.join(tempDir, 'output');
        await fs.mkdir(scriptOutputDir);

        // 2. Save uploaded file
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(tempFilePath, fileBuffer);
        sendEvent({ status: 'info', message: 'PPT文件已保存到服务器。' });

        // 3. Run the Python script
        sendEvent({ status: 'processing', message: '正在调用Python脚本转换文件... (此步骤可能需要较长时间)' });
        const conversionResult = await runPythonConverter(tempFilePath, scriptOutputDir);
        if (!conversionResult || !conversionResult.previews || !conversionResult.thumbnails || conversionResult.previews.length !== conversionResult.thumbnails.length) {
            throw new Error("Python脚本未能成功转换或返回有效路径。");
        }
        sendEvent({ status: 'info', message: `文件转换成功！共生成 ${conversionResult.previews.length} 页预览。` });

        // 4. Prepare for DB insertion & upload
        const pptId = uuidv4();
        const slug = `${slugify(title, { lower: true, strict: true })}-${Date.now()}`;
        const fileExtension = path.extname(file.name).slice(1);

        // 5. Upload original PPT to R2
        sendEvent({ status: 'processing', message: '正在上传原始PPT文件到云存储...' });
        const originalFileKey = `ppt-files/${pptId}/original/${file.name}`;
        await r2.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: originalFileKey,
            Body: fileBuffer,
            ContentType: file.type,
        }));
        sendEvent({ status: 'info', message: '原始PPT文件上传完成。' });

        // 6. Upload previews and thumbnails
        sendEvent({ status: 'processing', message: '正在上传预览图和缩略图...' });
        const uploadAndRecordPromises = conversionResult.previews.map(async (previewPath, index) => {
            const thumbnailPath = conversionResult.thumbnails[index];
            const previewFilename = path.basename(previewPath);
            const thumbnailFilename = path.basename(thumbnailPath);

            const previewContent = await fs.readFile(previewPath);
            const thumbnailContent = await fs.readFile(thumbnailPath);

            const previewKey = `ppt-files/${pptId}/previews/${previewFilename}`;
            const thumbnailKey = `ppt-files/${pptId}/previews/${thumbnailFilename}`;

            // Upload both preview and thumbnail
            await Promise.all([
                r2.send(new PutObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME!,
                    Key: previewKey,
                    Body: previewContent,
                    ContentType: 'image/jpeg',
                })),
                r2.send(new PutObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME!,
                    Key: thumbnailKey,
                    Body: thumbnailContent,
                    ContentType: 'image/jpeg',
                }))
            ]);

            sendEvent({ status: 'info', message: `已上传: ${previewFilename} & ${thumbnailFilename}` });

            return {
                ppt_id: pptId,
                page_number: index + 1,
                preview_url: previewKey,
                thumbnail_url: thumbnailKey,
            };
        });

        const previewRecords = await Promise.all(uploadAndRecordPromises);
        sendEvent({ status: 'info', message: '所有图片上传完成。' });
        
        const firstThumbnailKey = previewRecords.length > 0 ? previewRecords[0].thumbnail_url : null;

        // 7. Insert into Supabase
        sendEvent({ status: 'processing', message: '正在将文件信息写入数据库...' });
        
        // DIAGNOSTIC LOG: Print the data before inserting
        console.log("[DEBUG] Inserting into ppt_files:", {
          id: pptId,
          title,
          slug,
          description,
          category,
          subcategory,
          tags: tags.split(",").map((t) => t.trim()),
          file_name: file.name,
          file_size: file.size,
          file_type: fileExtension,
          page_count: previewRecords.length,
          r2_file_key: originalFileKey,
          r2_thumbnail_key: firstThumbnailKey,
        });

        const { error: fileInsertError } = await supabase.from("ppt_files").insert({
          id: pptId,
          title,
          slug,
          description,
          category,
          subcategory,
          tags: tags.split(",").map((t) => t.trim()),
          file_name: file.name,
          file_size: file.size,
          file_type: fileExtension,
          page_count: previewRecords.length,
          r2_file_key: originalFileKey,
          r2_thumbnail_key: firstThumbnailKey,
        });
        if (fileInsertError) throw new Error(`数据库(ppt_files)入库失败: ${fileInsertError.message}`);
        
        // DIAGNOSTIC LOG: Print the data before inserting
        console.log("[DEBUG] Inserting into ppt_previews:", previewRecords);

        const { error: previewsInsertError } = await supabase.from("ppt_previews").insert(previewRecords);
        if (previewsInsertError) throw new Error(`数据库(ppt_previews)入库失败: ${previewsInsertError.message}`);
        sendEvent({ status: 'info', message: '数据库写入成功！' });

        // 8. Success!
        sendEvent({ status: 'done', message: '所有任务已成功完成！', slug: slug });

      } catch (error: any) {
        console.error("Upload process failed:", error);
        // This will be caught by the outer try/catch in createStreamResponse
        throw error;
      } finally {
          // 9. Clean up
          if (tempDir) {
              await fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
                  console.error(`清理临时目录失败 ${tempDir}:`, err);
              });
              // Don't send event here, as the main logic might have already finished or errored.
          }
          close();
      }
    });
  } catch (error: any) {
    console.error("API route error:", error);
    return NextResponse.json(
      { 
        error: 'Upload failed', 
        message: error.message || 'An unknown error occurred',
        details: error.toString()
      }, 
      { status: 500 }
    );
  }
} 
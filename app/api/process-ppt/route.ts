import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import mime from 'mime-types';

// Configure body size limit for this route
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
  },
};

console.log("Module /api/process-ppt/route.ts loaded successfully.");

// --- Helper Functions (copied from previous files) ---

const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or key not defined in environment variables.');
  }
  return createClient(supabaseUrl, supabaseKey);
};

const getS3Client = () => {
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error('R2 environment variables not defined. Please check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
};

const uploadToR2 = async (s3Client: S3Client, bucket: string, key: string, body: Buffer, contentType: string) => {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(command);
  return key; 
};

// --- New Python & AI Execution Logic ---

const runPythonScript = (scriptPath: string, args: string[]): Promise<string> => {
    return new Promise((resolve, reject) => {
        console.log(`[runPythonScript] Executing: python ${scriptPath} ${args.join(' ')}`);
        const pythonProcess = spawn('python', [scriptPath, ...args]);
        
        let stdout = '';
        let stderr = '';
        pythonProcess.stdout.setEncoding('utf8');
        pythonProcess.stderr.setEncoding('utf8');
        
        pythonProcess.stdout.on('data', (data) => {
            stdout += data;
        });
        pythonProcess.stderr.on('data', (data) => {
            stderr += data;
        });

        pythonProcess.on('close', (code) => {
            console.log(`[runPythonScript] Finished for ${scriptPath}. Exit code: ${code}`);
            console.log(`[runPythonScript] stdout:\n${stdout}`);
            console.error(`[runPythonScript] stderr:\n${stderr}`);
            if (code !== 0) {
                reject(new Error(`Python script ${scriptPath} failed with code ${code}:\n${stderr}`));
            } else {
                resolve(stdout);
            }
        });
        
        pythonProcess.on('error', (err) => {
            console.error(`[runPythonScript] Failed to start ${scriptPath}.`, err);
            reject(err)
        });
    });
};

const getAiMetadata = async (text: string, filename: string) => {
    const apiKey = process.env.DOUBAO_API_KEY;
    if (!apiKey) throw new Error('DOUBAO_API_KEY environment variable not set.');

    const categories = [ 'Business & Corporate', 'Education & Training', 'Marketing & Sales', 'Technology & Startups', 'Healthcare & Medical', 'Finance & Investment', 'Creative & Design', 'Events & Celebrations', 'Non-profit & Social', 'Personal & Lifestyle' ];
    const subcategories: Record<string, string[]> = {
        'Business & Corporate': ['Business reports', 'Project proposals', 'Pitch decks', 'Quarterly reviews'],
        'Education & Training': ['Course materials', 'Academic presentations', 'Workshops', 'Seminars'],
        'Marketing & Sales': ['Product launches', 'Client presentations', 'Sales pitches', 'Brand guidelines'],
        'Technology & Startups': ['Tech demos', 'Investor presentations', 'Product roadmaps', 'User research'],
        'Healthcare & Medical': ['Medical conferences', 'Patient education', 'Research presentations', 'Clinical reports'],
        'Finance & Investment': ['Financial reports', 'Investment proposals', 'Budget presentations', 'Market analysis'],
        'Creative & Design': ['Portfolio showcases', 'Creative briefs', 'Design proposals', 'Artistic presentations'],
        'Events & Celebrations': ['Corporate events', 'Conferences', 'Webinars', 'Award ceremonies'],
        'Non-profit & Social': ['Fundraising presentations', 'Community outreach', 'Social impact reports'],
        'Personal & Lifestyle': ['Wedding presentations', 'Travel journals', 'Hobby showcases', 'Personal branding'],
    };
    const getCategoryPrompt = () => {
        return categories.map(cat => `- ${cat}\n  - Subcategories: ${subcategories[cat].join(', ')}`).join('\n');
    };

    const systemPrompt = `You are an expert content analyst. Your task is to analyze presentation content and generate structured metadata for it. Based on the user's input (original filename and extracted text), you must generate a new title, a URL-friendly slug, a short description, and select the most appropriate category and subcategory from the provided list.

Your response MUST be a single, valid JSON object, with no other text before or after it.
The JSON object must have the following keys: "title", "slug", "description", "category", "subcategory".
The "slug" should be lowercase and use hyphens instead of spaces.
The "category" and "subcategory" MUST be one of the values from the provided lists.`;

    const userPrompt = `Here is the presentation content.
Original Filename: "${filename}"
Extracted Text:
---
${text.substring(0, 3000)}
---

Please generate the metadata based on the rules and category list provided.

Available Categories:
${getCategoryPrompt()}
`;

    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: 'doubao-1-5-pro-32k-250115',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            stream: false,
            temperature: 0.3,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Doubao API request failed: ${errorBody}`);
    }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error('Could not parse content from Doubao API response.');
    
    return JSON.parse(content);
};


// --- Main API Route ---

export async function POST(req: NextRequest) {
  console.log('[API /process-ppt] Received new request.');
  
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Check file size (100MB limit)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File too large', 
        message: `File size exceeds limit. Maximum allowed: 100MB, Current file size: ${(file.size / 1024 / 1024).toFixed(2)}MB` 
      }, { status: 413 });
    }

    let tempDir: string | null = null;

    try {
      console.log('[API /process-ppt] Entering main try block.');
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ppt-process-'));
      const tempFilePath = path.join(tempDir, file.name);
      
      const s3Client = getS3Client();
      const supabase = getSupabaseClient();
      const r2Bucket = process.env.R2_BUCKET_NAME;
      if (!r2Bucket) {
          throw new Error('R2_BUCKET_NAME environment variable not set');
      }

      // 1. Save file temporarily
      await fs.writeFile(tempFilePath, Buffer.from(await file.arrayBuffer()));
      console.log(`[API /process-ppt] Step 1: File saved to temp path: ${tempFilePath}`);

      // 2. Generate Previews & Get Page Count FIRST
      const previewOutputDir = path.join(tempDir, 'previews');
      await fs.mkdir(previewOutputDir, { recursive: true });
      const convertOutputJson = await runPythonScript('convert.py', [tempFilePath, previewOutputDir]);
      const previewData = JSON.parse(convertOutputJson.trim());
      const pageCount = previewData.page_count || 0;
      console.log(`[API /process-ppt] Step 2: File has ${pageCount} pages.`);

      // 3. Check Page Count: Skip if less than 10
      if (pageCount < 10) {
          console.log(`[API /process-ppt] Skipping file because it has only ${pageCount} pages. No DB record will be created.`);
          await fs.rm(tempDir, { recursive: true, force: true });
          return NextResponse.json({
              skipped: true,
              reason: `File skipped: Page count (${pageCount}) is less than 10.`,
              fileName: file.name
          });
      }

      if (!previewData.previews || previewData.previews.length === 0) {
          throw new Error('convert.py did not return any preview paths.');
      }
      
      // 4. Extract text (only if page count is valid)
      const extractedText = await runPythonScript('extract_text.py', [tempFilePath]);
      console.log(`[API /process-ppt] Step 4: Extracted ${extractedText.length} characters of text.`);
      
      // 5. Get metadata from AI
      const metadata = await getAiMetadata(extractedText, file.name);
      console.log(`[API /process-ppt] Step 5: Received metadata from AI. Title: ${metadata.title}`);

      const uniqueSlug = `${metadata.slug}-${Date.now().toString(36).slice(-6)}`;
      
      // 6. Create initial DB record to get an ID
      const { data: pptFileData, error: insertError } = await supabase
        .from('ppt_files')
        .insert({
          title: metadata.title,
          slug: uniqueSlug,
          description: metadata.description,
          category: metadata.category,
          subcategory: metadata.subcategory,
          tags: metadata.tags || [],
          file_name: file.name,
          file_size: file.size,
          file_type: path.extname(file.name).slice(1),
          page_count: pageCount, // We already have the page count
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      const pptId = pptFileData.id;
      console.log(`[API /process-ppt] Step 6: Created initial DB record with ID: ${pptId}`);
      
      // 7. Upload original PPT to R2
      const originalFileKey = await uploadToR2(
        s3Client,
        r2Bucket,
        `ppt-files/${pptId}/original/${file.name}`,
        await fs.readFile(tempFilePath),
        file.type
      );
      console.log(`[API /process-ppt] Step 7: Uploaded original file to R2 with key: ${originalFileKey}`);
      
      // 8. Create and upload thumbnail
      const firstPreviewPath = previewData.previews[0];
      const thumbnailBuffer = await sharp(firstPreviewPath).resize(400, 225, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
      const thumbnailKey = await uploadToR2(
          s3Client,
          r2Bucket,
          `ppt-files/${pptId}/previews/thumbnail.webp`,
          thumbnailBuffer,
          'image/webp'
      );
      console.log(`[API /process-ppt] Step 8: Created and uploaded thumbnail to R2 with key: ${thumbnailKey}`);

      // 9. Upload all preview & thumbnail images and record them to DB
      console.log(`[API /process-ppt] Step 9: Starting upload of all page previews and thumbnails.`);
      const previewRecords: { ppt_id: string; page_number: number; preview_url: string; thumbnail_url: string; }[] = [];

      for (let i = 0; i < previewData.previews.length; i++) {
          const pageNum = i + 1;
          
          // Process and upload Preview
          const previewPath = previewData.previews[i];
          const previewBuffer = await fs.readFile(previewPath);
          const previewWebpBuffer = await sharp(previewBuffer).webp({ quality: 90 }).toBuffer();
          const previewKey = await uploadToR2(
              s3Client,
              r2Bucket,
              `ppt-files/${pptId}/previews/page-${pageNum}.webp`,
              previewWebpBuffer,
              'image/webp'
          );

          // Process and upload Thumbnail
          const thumbnailPath = previewData.thumbnails[i];
          const thumbnailBuffer = await fs.readFile(thumbnailPath);
          const thumbnailWebpBuffer = await sharp(thumbnailBuffer).webp({ quality: 85 }).toBuffer();
          const pageThumbnailKey = await uploadToR2(
              s3Client,
              r2Bucket,
              `ppt-files/${pptId}/previews/page-${pageNum}-thumb.webp`,
              thumbnailWebpBuffer,
              'image/webp'
          );
          
          previewRecords.push({
              ppt_id: pptId,
              page_number: pageNum,
              preview_url: previewKey,
              thumbnail_url: pageThumbnailKey,
          });
          console.log(`[API /process-ppt] - Uploaded page ${pageNum} preview and thumbnail.`);
      }
      
      const { error: previewInsertError } = await supabase.from('ppt_previews').insert(previewRecords);

      if (previewInsertError) {
          console.error('[API /process-ppt] Error inserting into ppt_previews:', previewInsertError);
          throw previewInsertError;
      }

      console.log(`[API /process-ppt] Step 9: Finished upload and recorded ${previewRecords.length} pages to ppt_previews.`);

      // 10. Update the main DB record with R2 keys
      await supabase
        .from('ppt_files')
        .update({
          r2_file_key: originalFileKey,
          r2_thumbnail_key: thumbnailKey,
          // page_count is already set during insert
        })
        .eq('id', pptId);
      console.log(`[API /process-ppt] Step 10: Finalized DB record.`);

      // 11. Success
      console.log('[API /process-ppt] Processing finished successfully.');
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log(`[API /process-ppt] Cleanup: Removed temp directory ${tempDir}`);

      // Final success response should contain all the relevant data
      return NextResponse.json({
        message: 'File processed and all assets stored successfully.',
        pptId: pptId,
        r2_original_key: originalFileKey,
        r2_thumbnail_key: thumbnailKey,
        r2_preview_keys: previewRecords.map(record => record.preview_url),
        ...metadata, // Spread all of AI-generated metadata here
      });

    } catch (error) {
      console.error('[API /process-ppt] CATCH BLOCK: An error occurred during processing.', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      return NextResponse.json({ error: 'Processing failed', details: errorMessage }, { status: 500 });
    } finally {
      // Cleanup temp directory if it exists
      if (tempDir) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('[API /process-ppt] Failed to cleanup temp directory:', cleanupError);
        }
      }
    }
  } catch (error: any) {
    console.error('[API /process-ppt] Outer catch block:', error);
    return NextResponse.json(
      { 
        error: 'Request failed', 
        message: error.message || 'An unknown error occurred',
        details: error.toString()
      }, 
      { status: 500 }
    );
  }
} 
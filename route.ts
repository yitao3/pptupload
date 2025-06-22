import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

// 创建 Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 创建 S3 客户端
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const category = formData.get('category') as string;
    const subcategory = formData.get('subcategory') as string;
    
    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file provided' },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json(
        { success: false, message: 'Title is required' },
        { status: 400 }
      );
    }

    // 验证文件类型
    const fileType = file.name.split('.').pop()?.toLowerCase();
    if (!fileType || !['ppt', 'pptx'].includes(fileType)) {
      return NextResponse.json(
        { success: false, message: 'Only PPT/PPTX files are allowed' },
        { status: 400 }
      );
    }

    // 生成唯一的文件名
    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.name}`;

    // 上传到 R2
    const pptKey = `ppt-files/${timestamp}/original/${file.name}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: pptKey,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type,
    }));

    // 计算实际的 page_count（假设为预览图数量）
    const previewsRaw = formData.get('previews');
    const thumbnailsRaw = formData.get('thumbnails');

    if (!previewsRaw || !thumbnailsRaw) {
      return NextResponse.json({ error: 'Missing previews or thumbnails data' }, { status: 400 });
    }

    const previews = JSON.parse(previewsRaw as string);
    const thumbnails = JSON.parse(thumbnailsRaw as string);

    if (!Array.isArray(previews) || !Array.isArray(thumbnails)) {
      return NextResponse.json({ error: 'Invalid previews or thumbnails data' }, { status: 400 });
    }

    const pageCount = previews.length;

    // 保存到 Supabase
    const { data: pptData, error: pptError } = await supabase
      .from('ppt_files')
      .insert({
        title,
        file_name: file.name,
        file_size: file.size,
        page_count: pageCount,
        file_type: file.name.split('.').pop()?.toLowerCase() || 'pptx',
        r2_file_key: pptKey,
        category,
        subcategory,
      })
      .select()
      .single();

    if (pptError) {
      // 如果数据库保存失败，删除已上传的文件
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: pptKey,
      }));
      
      throw new Error(`Database error: ${pptError.message}`);
    }

    // 上传缩略图和预览图到 R2
    for (let i = 0; i < previews.length; i++) {
      const previewKey = `ppt-files/${timestamp}/previews/page-${i + 1}.jpg`;
      const thumbnailKey = `ppt-files/${timestamp}/previews/page-${i + 1}-thumb.jpg`;

      // 上传预览图
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: previewKey,
        Body: Buffer.from(previews[i].split(',')[1], 'base64'),
        ContentType: 'image/jpeg',
      }));

      // 上传缩略图
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: thumbnailKey,
        Body: Buffer.from(thumbnails[i].split(',')[1], 'base64'),
        ContentType: 'image/jpeg',
      }));

      // 保存预览图信息到 Supabase
      await supabase.from('ppt_previews').insert({
        ppt_id: pptData.id,
        page_number: i + 1,
        preview_url: previewKey,
        thumbnail_url: thumbnailKey,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        id: pptData.id,
        title: pptData.title,
        fileName: pptData.file_name,
        fileUrl: `${process.env.R2_PUBLIC_URL}/${fileName}`,
        fileSize: pptData.file_size,
        fileType: pptData.file_type,
        createdAt: pptData.created_at
      }
    });
  } catch (error: any) {
    console.error('Upload failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to upload file',
        error: error.message 
      },
      { status: 500 }
    );
  }
} 
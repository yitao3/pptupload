'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';

export default function TestUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<'pending' | 'generating' | 'completed' | 'failed'>('pending');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');

  const categories = [
    { value: 'Business & Corporate', label: 'Business & Corporate' },
    { value: 'Education & Training', label: 'Education & Training' },
    { value: 'Marketing & Sales', label: 'Marketing & Sales' },
    { value: 'Technology & Startups', label: 'Technology & Startups' },
    { value: 'Healthcare & Medical', label: 'Healthcare & Medical' },
    { value: 'Finance & Investment', label: 'Finance & Investment' },
    { value: 'Creative & Design', label: 'Creative & Design' },
    { value: 'Events & Celebrations', label: 'Events & Celebrations' },
    { value: 'Non-profit & Social', label: 'Non-profit & Social' },
    { value: 'Personal & Lifestyle', label: 'Personal & Lifestyle' },
  ] as const;

  type Category = typeof categories[number]['value'];

  const subcategories: Record<Category, string[]> = {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const fileType = selectedFile.name.split('.').pop()?.toLowerCase();
      
      if (!fileType || !['ppt', 'pptx'].includes(fileType)) {
        setError('Only PPT/PPTX files are allowed');
        setFile(null);
        return;
      }
      
      setFile(selectedFile);
      setError(null);
      setResult(null);
      setPreviewStatus('pending');
    }
  };

  const handleZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedZip = e.target.files[0];
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(selectedZip);
      const imageFiles = Object.values(zipContent.files).filter(file => file.name.match(/\.(png|jpg|jpeg)$/i));
      const imageUrls = await Promise.all(imageFiles.map(file => file.async('base64')));
      setPreviewImages(imageUrls.map(url => `data:image/png;base64,${url}`));
      setZipFile(selectedZip);
    }
  };

  const generateThumbnails = async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const thumbnailUrls = await Promise.all(previewImages.map(async (url) => {
      const img = new Image();
      img.src = url;
      await new Promise(resolve => img.onload = resolve);
      const targetWidth = 200;
      const targetHeight = 150;
      const scale = Math.min(targetWidth / img.width, targetHeight / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
      }
      const x = (targetWidth - scaledWidth) / 2;
      const y = (targetHeight - scaledHeight) / 2;
      ctx?.drawImage(img, x, y, scaledWidth, scaledHeight);
      return canvas.toDataURL('image/jpeg');
    }));
    setThumbnails(thumbnailUrls);
  };

  useEffect(() => {
    if (previewImages.length > 0) {
      generateThumbnails();
    }
  }, [previewImages]);

  const handleUpload = async () => {
    if (!file || !zipFile) {
      setError('Please select both PPT and ZIP files');
      return;
    }

    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('zip', zipFile);
      formData.append('title', title);
      formData.append('category', category);
      formData.append('subcategory', subcategory);
      formData.append('previews', JSON.stringify(previewImages));
      formData.append('thumbnails', JSON.stringify(thumbnails));

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      setResult(data);
      setFile(null);
      setZipFile(null);
      setPreviewImages([]);
      setThumbnails([]);
      setTitle('');
      setCategory('');
      setSubcategory('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const pollPreviewStatus = async (pptId: string) => {
    const maxAttempts = 30; // 最多尝试 30 次
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/ppt/${pptId}`);
        const data = await response.json();

        if (data.preview_generated) {
          setPreviewStatus('completed');
          return true;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          setPreviewStatus('failed');
          return true;
        }

        return false;
      } catch (error) {
        console.error('Failed to check preview status:', error);
        setPreviewStatus('failed');
        return true;
      }
    };

    const poll = async () => {
      const shouldStop = await checkStatus();
      if (!shouldStop) {
        setTimeout(poll, 2000); // 每 2 秒检查一次
      }
    };

    poll();
  };

  const testSupabaseConnection = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/ppt_files?select=id`, {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        },
      });
      const data = await response.json();
      console.log('Supabase Response:', data);
      setResult(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-6 text-center">Upload PPT Template</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter template title"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subcategory
            </label>
            <select
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!category}
            >
              <option value="">Select a subcategory</option>
              {category && subcategories[category as Category]?.map((subcat: string) => (
                <option key={subcat} value={subcat}>{subcat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select PPT File
            </label>
            <input
              type="file"
              accept=".ppt,.pptx"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select ZIP File with Preview Images
            </label>
            <input
              type="file"
              accept=".zip"
              onChange={handleZipChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || !title.trim() || uploading}
            className={`w-full py-2 px-4 rounded-md text-white font-medium
              ${!file || !title.trim() || uploading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
              }`}
          >
            {uploading ? 'Uploading...' : 'Upload Template'}
          </button>

          <button
            onClick={testSupabaseConnection}
            className="w-full py-2 px-4 rounded-md text-white font-medium bg-green-600 hover:bg-green-700"
          >
            Test Supabase Connection
          </button>

          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-md">
              {error}
            </div>
          )}

          {result && (
            <div className="p-4 bg-green-50 text-green-700 rounded-md">
              {Array.isArray(result) ? (
                <>
                  <p className="font-medium">Supabase 测试数据：</p>
                  <pre>{JSON.stringify(result, null, 2)}</pre>
                </>
              ) : (
                <>
                  <p className="font-medium">Upload Successful!</p>
                  <div className="mt-2 space-y-1">
                    <p>Title: {result.data?.title}</p>
                    <p>File: {result.data?.fileName}</p>
                    <p>Size: {result.data?.fileSize ? (result.data.fileSize / 1024 / 1024).toFixed(2) : ''} MB</p>
                    <p>Type: {result.data?.fileType?.toUpperCase()}</p>
                    <p>File URL: {result.data?.fileUrl && (
                      <a href={result.data.fileUrl} target="_blank" rel="noopener noreferrer" className="underline">{result.data.fileUrl}</a>
                    )}</p>
                    <p>Preview Status: {
                      result.data?.previewStatus === 'pending' ? 'Pending' :
                      result.data?.previewStatus === 'generating' ? 'Generating...' :
                      result.data?.previewStatus === 'completed' ? 'Completed' :
                      result.data?.previewStatus === 'failed' ? 'Failed' :
                      ''
                    }</p>
                  </div>
                </>
              )}
            </div>
          )}

          {previewImages.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Preview Images</h3>
              <div className="grid grid-cols-2 gap-4">
                {previewImages.map((url, index) => (
                  <div key={index} className="relative">
                    <img src={url} alt={`Preview ${index + 1}`} className="w-full h-auto" />
                    <img src={thumbnails[index]} alt={`Thumbnail ${index + 1}`} className="w-20 h-15 absolute bottom-2 right-2" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 
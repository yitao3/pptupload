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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            PPT Upload System
          </h1>

          <div className="space-y-6">
            {/* File Upload Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PPT File Upload */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".ppt,.pptx"
                  onChange={handleFileChange}
                  className="hidden"
                  id="ppt-file"
                />
                <label htmlFor="ppt-file" className="cursor-pointer">
                  <div className="text-gray-600">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-2 text-sm font-medium">Upload PPT File</p>
                    <p className="mt-1 text-xs text-gray-500">PPT or PPTX files only</p>
                  </div>
                </label>
                {file && (
                  <div className="mt-4 p-3 bg-green-50 rounded-md">
                    <p className="text-sm text-green-800">✓ {file.name}</p>
                  </div>
                )}
              </div>

              {/* ZIP File Upload */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleZipChange}
                  className="hidden"
                  id="zip-file"
                />
                <label htmlFor="zip-file" className="cursor-pointer">
                  <div className="text-gray-600">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-2 text-sm font-medium">Upload Preview ZIP</p>
                    <p className="mt-1 text-xs text-gray-500">ZIP file with preview images</p>
                  </div>
                </label>
                {zipFile && (
                  <div className="mt-4 p-3 bg-green-50 rounded-md">
                    <p className="text-sm text-green-800">✓ {zipFile.name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter presentation title"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a category</option>
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="subcategory" className="block text-sm font-medium text-gray-700 mb-2">
                    Subcategory
                  </label>
                  <select
                    id="subcategory"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!category}
                  >
                    <option value="">Select a subcategory</option>
                    {category && subcategories[category as Category]?.map((subcat) => (
                      <option key={subcat} value={subcat}>
                        {subcat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Preview Images */}
            {previewImages.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Preview Images</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {previewImages.map((image, index) => (
                    <div key={index} className="relative">
                      <img
                        src={image}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border"
                      />
                      <div className="absolute top-1 left-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                        {index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Button */}
            <div className="flex justify-center">
              <button
                onClick={handleUpload}
                disabled={uploading || !file || !zipFile || !title.trim()}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? 'Uploading...' : 'Upload Presentation'}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {result && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <h3 className="text-green-800 font-medium">Upload Successful!</h3>
                <p className="text-green-700 mt-1">Presentation uploaded successfully.</p>
                <pre className="mt-2 text-sm text-green-600 bg-green-100 p-2 rounded overflow-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 
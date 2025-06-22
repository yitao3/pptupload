'use client';

import { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

interface StructuredResult {
  title: string;
  slug: string;
  description: string;
  category: string;
  subcategory: string;
}

export default function ExtractTextTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [structuredResult, setStructuredResult] = useState<StructuredResult | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFile = e.target.files[0];
      if (selectedFile && selectedFile.name.endsWith('.pptx')) {
        setFile(selectedFile);
        setExtractedText('');
        setStructuredResult(null);
      } else {
        toast.error('Please select a .pptx file.');
        e.target.value = '';
      }
    }
  };

  const handleExtractSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a file first.');
      return;
    }

    setIsExtracting(true);
    setExtractedText('');
    setStructuredResult(null);
    const toastId = toast.loading('Extracting text from presentation...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/extract-text', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(`Error: ${result.error || 'Failed to extract text.'}`, { id: toastId, duration: 5000 });
      } else {
        setExtractedText(result.text);
        toast.success('Text extracted successfully!', { id: toastId });
      }
    } catch (error) {
      toast.error('An unexpected error occurred. Check the console.', { id: toastId });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSummarize = async () => {
    if (!extractedText || !file) {
      toast.error('Please extract text from a file first.');
      return;
    }

    setIsSummarizing(true);
    setStructuredResult(null);
    const toastId = toast.loading('Analyzing content with Doubao...');

    try {
      const response = await fetch('/api/summarize-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractedText, filename: file.name }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(`Analysis failed: ${result.error}`, { id: toastId, duration: 5000 });
        console.error('Analysis failed details:', result.details);
      } else {
        setStructuredResult(result);
        toast.success('Content analysis successful!', { id: toastId });
      }
    } catch (error) {
      toast.error('An unexpected error occurred. Check the console.', { id: toastId });
    } finally {
      setIsSummarizing(false);
    }
  };

  const InfoCard = ({ label, value }: { label: string; value: string }) => (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{label}</h3>
      <p className="mt-1 text-md text-gray-900">{value}</p>
    </div>
  );

  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-24 bg-gray-50">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="w-full max-w-3xl bg-white p-6 sm:p-8 rounded-lg shadow-lg">
        <h1 className="text-xl sm:text-2xl font-bold mb-6 text-center text-gray-800">PPTX Content Analysis</h1>
        {/* Step 1: Upload */}
        <div className="border-b pb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Step 1: Upload a .pptx file</h2>
          <form onSubmit={handleExtractSubmit}>
            <input
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={handleFileChange}
              className="mb-3 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
            />
            <button
              type="submit"
              disabled={!file || isExtracting}
              className="w-full bg-violet-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-violet-700 disabled:bg-gray-400"
            >
              {isExtracting ? 'Extracting Text...' : 'Extract Text'}
            </button>
          </form>
        </div>

        {/* Step 2: Analyze */}
        {extractedText && (
          <div className="border-b py-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Step 2: Analyze Content</h2>
              <button
                onClick={handleSummarize}
                disabled={isSummarizing || !extractedText}
                className="bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
              >
                {isSummarizing ? 'Analyzing...' : 'Analyze with Doubao'}
              </button>
            </div>
            <p className="text-sm text-gray-600">Extracted {extractedText.length} characters of text. Click the button to generate metadata.</p>
          </div>
        )}

        {/* Step 3: Results */}
        {structuredResult && (
          <div className="pt-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Step 3: Analysis Results</h2>
            <div className="space-y-4 rounded-lg border bg-white p-4">
              <InfoCard label="Generated Title" value={structuredResult.title} />
              <InfoCard label="Generated Slug" value={structuredResult.slug} />
              <InfoCard label="Category" value={`${structuredResult.category} > ${structuredResult.subcategory}`} />
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Description</h3>
                <p className="mt-1 text-md text-gray-900 whitespace-pre-wrap">{structuredResult.description}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
} 
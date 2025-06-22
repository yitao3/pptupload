import { NextRequest, NextResponse } from 'next/server';

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

const categories = [
    'Business & Corporate', 'Education & Training', 'Marketing & Sales', 
    'Technology & Startups', 'Healthcare & Medical', 'Finance & Investment',
    'Creative & Design', 'Events & Celebrations', 'Non-profit & Social', 'Personal & Lifestyle'
];

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

// Helper function to format the categories for the prompt
const getCategoryPrompt = () => {
    return categories.map(cat => 
        `- ${cat}\n  - Subcategories: ${subcategories[cat].join(', ')}`
    ).join('\n');
};

const systemPrompt = `You are an expert content analyst. Your task is to analyze presentation content and generate structured metadata for it. Based on the user's input (original filename and extracted text), you must generate a new title, a URL-friendly slug, a short description, and select the most appropriate category and subcategory from the provided list.

Your response MUST be a single, valid JSON object, with no other text before or after it.
The JSON object must have the following keys: "title", "slug", "description", "category", "subcategory".
The "title" MUST NOT exceed 6 words.
The "slug" should be lowercase and use hyphens instead of spaces.
The "category" and "subcategory" MUST be one of the values from the provided lists.`;


export async function POST(req: NextRequest) {
  try {
    const { text, filename } = await req.json();

    if (!text || typeof text !== 'string' || !filename || typeof filename !== 'string') {
      return NextResponse.json({ error: 'Text and filename are required in the request body' }, { status: 400 });
    }

    const apiKey = process.env.DOUBAO_API_KEY;

    if (!apiKey) {
         return NextResponse.json({ 
            error: 'DOUBAO_API_KEY environment variable not set.'
        }, { status: 500 });
    }
    
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

    const response = await fetch(DOUBAO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'doubao-1-5-pro-32k-250115', // Using the precise model name from the user's working curl example.
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          },
        ],
        stream: false,
        temperature: 0.3, // Lower temperature for more predictable, structured output
      }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('Doubao API Error:', response.status, errorBody);
        return NextResponse.json({ error: 'Failed to get a response from Doubao API.', details: errorBody }, { status: response.status });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (!content) {
        console.error('Unexpected Doubao API response structure:', result);
        return NextResponse.json({ error: 'Could not parse content from Doubao API response.' }, { status: 500 });
    }

    try {
        // The model should return a JSON string. We need to parse it.
        const structuredData = JSON.parse(content);
        return NextResponse.json(structuredData);
    } catch (e) {
        console.error('Failed to parse JSON from Doubao response:', content);
        return NextResponse.json({ error: 'Model did not return valid JSON.', details: content }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in /api/summarize-text:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal server error.', details: errorMessage }, { status: 500 });
  }
} 
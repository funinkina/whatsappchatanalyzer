import React from 'react';

interface Person {
  name: string;
  animal: string;
  description: string;
}

interface AIAnalysisProps {
  summary: string;
  people?: Person[];
  summaryOnly?: boolean;
  profilesOnly?: boolean;
}

// Function to get animal emoji based on animal type
const getAnimalEmoji = (animal: string): string => {
  const animalMap: { [key: string]: string } = {
    'owl': '🦉',
    'lion': '🦁',
    'dolphin': '🐬',
    'fox': '🦊',
    'bear': '🐻',
    'rabbit': '🐰',
    'monkey': '🐵',
    'tiger': '🐯',
    'wolf': '🐺',
    'eagle': '🦅',
    'elephant': '🐘',
    'penguin': '🐧',
    'cat': '🐱',
    'dog': '🐶',
    'koala': '🐨',
    'panda': '🐼',
    'sheep': '🐑',
  };

  // Return the emoji if it exists, otherwise return a default
  return animalMap[animal?.toLowerCase()] || '🦄';
};

const AIAnalysis: React.FC<AIAnalysisProps> = ({ summary, people = [], summaryOnly, profilesOnly }) => {
  // If neither flag is set, show both sections (default behavior)
  const showSummary = profilesOnly !== true;
  const showProfiles = summaryOnly !== true && people && people.length > 0;

  // For debugging
  // console.log('AI Analysis Props:', { summary, peopleLength: people?.length, summaryOnly, profilesOnly });

  return (
    <div className={profilesOnly ? "mb-8" : "mb-16"}>
      {/* Summary Section */}
      {showSummary && (
        summary ? (
          <div>
            <p className="text-blue-950 text-2xl font-medium">{summary}</p>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-6 mb-8 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.25)] border-2 border-neutral-800">
            <p className="text-gray-700 italic">No AI summary available</p>
          </div>
        )
      )}

      {/* Personality Profiles */}
      {showProfiles ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {people.map((person, index) => (
              <div
                key={index}
                className="bg-amber-50 rounded-xl p-6 border-2 border-neutral-800"
              >
                <div className="flex items-center mb-4">
                  <span className="text-4xl mr-3">{getAnimalEmoji(person.animal)}</span>
                  <div>
                    <h4 className="font-bold text-xl text-blue-950">{person.name}</h4>
                    <p className="text-sm text-gray-600 italic">The {person.animal.charAt(0).toUpperCase() + person.animal.slice(1)} {people.length > 2 ? 'of the group' : ''}</p>
                  </div>
                </div>
                <p className="text-gray-700">{person.description}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        // Only show this if we explicitly requested profiles but there aren't any
        profilesOnly && (
          <div className="bg-gray-50 rounded-xl p-6 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.25)] border-2 border-neutral-800">
            <p className="text-gray-700 italic">
              {people && people.length === 0 ?
                "No personality profiles available - there might be more than 10 users in this chat." :
                "No personality profiles available"}
            </p>
          </div>
        )
      )}
    </div>
  );
};

export default AIAnalysis;
import React from 'react';

interface Person {
  name: string;
  animal: string;
  description: string;
}

interface AIAnalysisProps {
  summary: string;
  people: Person[];
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
  };

  // Return the emoji if it exists, otherwise return a default
  return animalMap[animal.toLowerCase()] || '🦄';
};

const AIAnalysis: React.FC<AIAnalysisProps> = ({ summary, people, summaryOnly, profilesOnly }) => {
  // If neither flag is set, show both sections (default behavior)
  const showSummary = profilesOnly !== true;
  const showProfiles = summaryOnly !== true;

  return (
    <div className={profilesOnly ? "mb-8" : "mb-16"}>
      {/* Summary Section */}
      {showSummary && (
        summary ? (
          <p className="text-blue-950 text-4xl">{summary}</p>
        ) : (
          <div className="bg-gray-50 rounded-xl p-6 mb-8 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.25)] border-2 border-neutral-800">
            <p className="text-gray-700 italic">No AI summary available</p>
          </div>
        )
      )}

      {/* Personality Profiles */}
      {showProfiles && (
        people && people.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {people.map((person, index) => (
                <div
                  key={index}
                  className="bg-amber-50 rounded-xl p-6 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.25)] border-2 border-neutral-800 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,0.25)] transition-shadow"
                >
                  <div className="flex items-center mb-4">
                    <span className="text-4xl mr-3">{getAnimalEmoji(person.animal)}</span>
                    <div>
                      <h4 className="font-bold text-xl text-blue-950">{person.name}</h4>
                      <p className="text-sm text-gray-600 italic">The {person.animal} {people.length > 2 ? 'of the group' : ''}</p>
                    </div>
                  </div>
                  <p className="text-gray-700">{person.description}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="bg-gray-50 rounded-xl p-6 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.25)] border-2 border-neutral-800">
            <p className="text-gray-700 italic">No personality profiles available</p>
          </div>
        )
      )}
    </div>
  );
};

export default AIAnalysis;
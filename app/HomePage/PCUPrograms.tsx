import { useState } from "react";

const STATIC_IMAGE = "/e-portal/images/a8.jpg";

const programs = [
  {
    title: "Foundation Programs",
    description:
      "Students who have been exposed to a minimum of one-year approved preparatory courses in PCU and subsequently have passed can seek Direct Entry admissions into the University Degree programmes at 200 level.",
    tags: ["JUPEB"],
  },
  {
    title: "Undergraduate Programs",
    description:
      "PCU offers a wide range of undergraduate degree programmes across faculties including Sciences, Arts, Social Sciences, Education and Management Sciences.",
    tags: ["B.Sc", "B.A", "B.Ed"],
  },
  {
    title: "Postgraduate Programs",
    description:
      "Our postgraduate programmes are designed to deepen knowledge and advance professional capacity, offering Masters and Doctoral degrees across several disciplines.",
    tags: ["M.Sc", "MBA", "Ph.D"],
  },
  {
    title: "Part Time Programs",
    description:
      "PCU's Part Time programmes provide flexible learning pathways for working professionals and individuals who need to balance education with other commitments.",
    tags: ["Part Time Degree"],
  },
];

export default function PCUPrograms() {
  const [current, setCurrent] = useState(0);

  const goTo = (index: number) => setCurrent((index + programs.length) % programs.length);

  return (
    <div className="bg-white py-12">
      <h2 className="text-2xl font-bold text-gray-800 mb-7 pl-4">PCU PROGRAMS</h2>

      <div className="flex flex-col md:flex-row min-h-[20rem] md:h-80 relative">

        {/* Left: Static image — never changes */}
        <div className="w-full md:w-1/2 h-64 md:h-full bg-gray-200 overflow-hidden">
          <img
            src={STATIC_IMAGE}
            alt="PCU Programs"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Right: Red info panel — slides on arrow click only */}
        <div className="w-full md:w-1/2 bg-red-500 text-white p-7 flex flex-col justify-center">
          <h3 className="text-lg font-bold mb-3">{programs[current].title}</h3>
          <p className="text-xs leading-relaxed text-white/90 mb-5">
            {programs[current].description}
          </p>
          <p className="text-[10px] font-bold tracking-widest uppercase text-white/60 mb-3">
            Program:
          </p>
          <div className="flex flex-wrap gap-2">
            {programs[current].tags.map((tag) => (
              <span
                key={tag}
                className="border border-white/60 bg-white/10 text-white text-xs font-bold tracking-wider uppercase px-4 py-2"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Nav arrows — bottom right corner */}
        <div className="absolute bottom-0 right-0 flex">
          <button
            onClick={() => goTo(current - 1)}
            className="w-10 h-10 bg-gray-800 hover:bg-gray-900 text-white flex items-center justify-center text-base transition-colors"
          >
            ←
          </button>
          <button
            onClick={() => goTo(current + 1)}
            className="w-10 h-10 bg-gray-700 hover:bg-gray-800 text-white flex items-center justify-center text-base transition-colors"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
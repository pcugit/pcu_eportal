"use client";

import Link from "next/link";

export default function AdmissionsPage() {
  const admissionPrograms = [
    {
      title: "Foundation Program Admission",
      description:
        "Students who have been exposed to a minimum of one-year approved preparatory courses in PCU and subsequently have passed can seek Direct Entry admissions into the University Degree programmes at 200 level.",
      link: "/FoundationProgram",
      image: "/e-portal/images/social-sciences.jpeg",
    },
    {
      title: "Part Time Admission",
      description:
        "Students who have been exposed to a minimum of one-year approved preparatory courses in PCU and subsequently have passed can seek Direct Entry admissions into the University Degree programmes at 200 level.",
      link: "/FoundationProgram",
      image:
        "/e-portal/images/a8-o8lkuj1li6ghb3dw31wbxviedhakhl9r3w04ydthe2.jpg",
    },
    {
      title: "Undergraduate Admission",
      description:
        "Our programs fosters the growth and development of intellectuals and creativity in all our students through the delivery of a well designed training curriculum.",
      link: "/Undergraduate",
      image: "/e-portal/images/students.jpg",
    },
    {
      title: "Postgraduate Admission",
      description:
        "We offer a wide range of professional courses in different fields.",
      link: "/Postgraduate#accredited-courses",
      image:
        "/e-portal/images/professional-2-og9n9wctzgx2f32uhvrzphkoq4lr5eg535henculvu.jpg",
    },
  ];

  return (
    <div className="w-full bg-background font-sans text-foreground">
      {/* Hero Banner */}
      <div className="relative w-full h-64 md:h-80 overflow-hidden">
        <img
          src="/e-portal/images/school1.png"
          alt="Admissions at PCU"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-purple-900/60" />

        <div className="relative z-10 max-w-5xl mx-auto h-full flex flex-col justify-end px-6 md:px-10 pb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-white drop-shadow-xl">
            Join Precious Cornerstone University
          </h1>
          <p className="mt-4 max-w-3xl text-sm md:text-base text-white/90 leading-relaxed">
            Explore the admissions routes available to future PCU students.
            Whether you are applying for undergraduate, postgraduate, part-time
            or JUPEB programmes, we offer clear guidance and direct next steps.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex justify-center bg-background">
        <div className="flex flex-col md:flex-row w-full max-w-6xl py-16 px-6 gap-12">
          {/* Right Content */}
          <div className="flex-1 min-w-0 w-full">
            <div className="mb-14">
              <h2 className="text-3xl md:text-[34px] font-normal text-[#54255f] mb-2 leading-tight">
                Want to earn a degree or improve you educational
              </h2>
              <h2 className="text-3xl md:text-[34px] font-normal text-[#54255f] mb-8 leading-tight">
                horizons? Look no further!
              </h2>
              <p className="text-muted-foreground leading-[1.8] text-[15px]">
                It’s a very exciting time to see what you could gain from
                studying with us at Precious Cornerstone University. By choosing
                Precious Cornerstone University, you’ll join bold and
                independent thinkers, get real-world experience, gain a global
                perspective and graduate ready to change the world. You’ll find
                everything you need to start your university life with us here.
              </p>
            </div>

            <div className="space-y-12">
              {admissionPrograms.map((program, index) => (
                <div
                  key={index}
                  className="flex flex-col md:flex-row gap-8 items-start border-b border-[#54255f]/10 pb-12 last:border-0"
                >
                  <div className="w-full md:w-[40%] shrink-0">
                    <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
                      {/* Using a placeholder for user to replace */}
                      <img
                        src={program.image}
                        alt={program.title}
                        className="object-cover w-full h-full"
                      />
                    </div>
                  </div>
                  <div className="w-full md:w-[60%] flex flex-col pt-2">
                    <h3 className="text-[22px] font-normal text-[#54255f] mb-4">
                      {program.title}
                    </h3>
                    <p className="text-muted-foreground leading-[1.8] text-[15px] mb-8">
                      {program.description}
                    </p>
                    <div className="mt-auto">
                      <Link
                        href={program.link}
                        className="inline-flex items-center text-[#b91c1c] font-semibold text-[13px] tracking-wide hover:text-[#54255f] transition-colors uppercase"
                      >
                        LEARN MORE{" "}
                        <span className="ml-3 text-lg leading-none">→</span>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Restored How to Apply section */}
            <section id="how-to-apply" className="scroll-mt-32 mt-16 mb-12">
              <h2 className="text-3xl font-bold text-[#54255f] mb-6">
                How to Apply
              </h2>
              <ol className="list-decimal pl-5 space-y-3 text-[15px] text-muted-foreground leading-relaxed">
                <li>
                  Choose the programme and admission route that fits your goals.
                </li>
                <li>
                  Gather all required documents before starting your
                  application.
                </li>
                <li>Complete the online application form at our portal.</li>
                <li>
                  Pay the application fee and upload your supporting documents.
                </li>
                <li>
                  Wait for the admissions team to review your submission and
                  contact you.
                </li>
              </ol>
            </section>

            {/* Restored Contact & Support section */}
            <section id="contact-support" className="scroll-mt-32 mt-16 mb-12">
              <h2 className="text-3xl font-bold text-[#54255f] mb-6">
                Contact & Support
              </h2>
              <p className="text-muted-foreground leading-[1.8] text-[15px] mb-6">
                Need help with your application? Reach out to our admissions
                team for guidance, clarifications, or support with document
                submission.
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-[#54255f]/10 p-6 bg-[#54255f]/[0.02]">
                  <h3 className="text-lg font-semibold text-[#b91c1c] mb-3">
                    Admissions Office
                  </h3>
                  <p className="text-[15px] text-muted-foreground leading-relaxed">
                    Email: admissions@pcu.edu.ng
                    <br />
                    Phone: +234 800 PCU HELP
                  </p>
                </div>
                <div className="rounded-xl border border-[#54255f]/10 p-6 bg-[#54255f]/[0.02]">
                  <h3 className="text-lg font-semibold text-[#b91c1c] mb-3">
                    Next Steps
                  </h3>
                  <p className="text-[15px] text-muted-foreground leading-relaxed">
                    After submitting your application, check your email
                    regularly for updates and login details to the student
                    portal.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

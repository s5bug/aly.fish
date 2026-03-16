export const prerender = false

export async function GET({ params }: { params: { unknownpage: string } }) {
  const path = params.unknownpage

  return new Response(path, {
    status: 200,
    headers: {
      'Content-Type': 'application/text',
    },
  })
}

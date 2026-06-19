import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClient } from './lib/db.mjs';

describe('contran normative articles postgres import', () => {
  it('importou artigos, vinculos e pendencias sem incluir questoes oficiais', async () => {
    const { client } = createClient({
      preferDirect: true,
      applicationName: 'test-contran-normative-articles'
    });
    await client.connect();
    try {
      const counts = await client.query(`
        SELECT
          (SELECT COUNT(*)::int FROM contran_normative_articles) AS articles,
          (SELECT COUNT(*)::int FROM contran_question_normative_references) AS refs,
          (SELECT COUNT(*)::int FROM missing_normative_articles_queue WHERE status = 'PENDENTE') AS pending,
          (
            SELECT COUNT(*)::int
            FROM contran_question_normative_references cqr
            JOIN contran_prf_unpublished_questions cq ON cq.question_id = cqr.question_id
            WHERE COALESCE(cq.is_official, 0) = 1 OR COALESCE(cq.official_exam, 0) = 1
          ) AS official_refs
      `);
      assert.ok(counts.rows[0].articles >= 461);
      assert.ok(counts.rows[0].refs >= 200);
      assert.ok(counts.rows[0].pending >= 300);
      assert.equal(counts.rows[0].official_refs, 0);

      const available = await client.query(`
        SELECT cna.full_text
        FROM contran_question_normative_references cqr
        JOIN contran_normative_articles cna ON cna.id = cqr.normative_article_id
        WHERE cqr.question_id = 905000001
      `);
      assert.equal(available.rows.length, 1);
      assert.match(available.rows[0].full_text, /Art\. 1º Esta Resolução/);

      const multiple = await client.query(`
        SELECT article, normative_article_id
        FROM contran_question_normative_references
        WHERE question_id = 905000045
        ORDER BY display_order
      `);
      assert.deepEqual(multiple.rows.map((row) => String(row.article)), ['11', '18', '19']);

      const multipleTexts = await client.query(`
        SELECT cqr.article, cna.full_text
        FROM contran_question_normative_references cqr
        JOIN contran_normative_articles cna
          ON cna.resolution_number = cqr.resolution_number
         AND cna.resolution_year = cqr.resolution_year
         AND cna.article = cqr.article
         AND cna.paragraph = ''
         AND cna.item = ''
         AND cna.subitem = ''
         AND cna.annex = cqr.annex
        WHERE cqr.question_id = 905000045
        ORDER BY cqr.display_order
      `);
      assert.deepEqual(multipleTexts.rows.map((row) => String(row.article)), ['11', '18', '19']);
      assert.match(multipleTexts.rows[0].full_text, /Art\. 11\./);

      const pending = await client.query(`
        SELECT COUNT(*)::int AS n
        FROM missing_normative_articles_queue
        WHERE question_id = 905000045
          AND article IN ('11', '18', '19')
      `);
      assert.equal(pending.rows[0].n, 3);
    } finally {
      await client.end().catch(() => {});
    }
  });
});

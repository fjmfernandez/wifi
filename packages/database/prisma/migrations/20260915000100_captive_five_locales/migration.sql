WITH localized_terms(locale, title, content, content_hash) AS (
  VALUES
    (
      'de',
      'Nutzungsbedingungen und Datenschutz',
      'Das WLAN wird bereitgestellt, um während Ihres Aufenthalts Internetzugang zu ermöglichen. Es darf nicht für rechtswidrige Aktivitäten, zur Störung anderer Nutzer oder zur Umgehung von Sicherheitsmaßnahmen verwendet werden. Mit der Annahme dieser Bedingungen und dem Zugang per E-Mail oder Google stimmen Sie zu, dass der Betrieb Ihre Kontaktdaten verwenden darf, um Ihnen Angebote, Vorteile und kommerzielle Mitteilungen im Zusammenhang mit seinen Dienstleistungen zu senden. Sie können die Abmeldung oder den Widerruf Ihrer Einwilligung gemäß der Datenschutzerklärung verlangen.',
      'ce6a925de9bd28ed1f08d797bb48cae376ade65718d5c1acd2913027b4886b60'
    ),
    (
      'fr',
      'Conditions d’utilisation et confidentialité',
      'Le réseau WiFi est fourni afin de permettre l’accès à Internet pendant votre séjour. Il ne doit pas être utilisé pour des activités illicites, pour perturber d’autres utilisateurs ou pour contourner les mesures de sécurité. En acceptant ces conditions et en accédant par email ou Google, vous autorisez l’établissement à utiliser vos coordonnées pour vous envoyer des offres, avantages et communications commerciales liées à ses services. Vous pouvez demander la désinscription ou le retrait de votre consentement conformément à la politique de confidentialité.',
      '6f7c6afd5828f1f15f9156a8403873794cff6181d0ddb23d41fa9fa04fe68fcb'
    ),
    (
      'ar',
      'شروط الاستخدام والخصوصية',
      'يتم توفير شبكة WiFi لإتاحة الوصول إلى الإنترنت أثناء إقامتك. لا يجوز استخدامها في أنشطة غير قانونية أو للتأثير على المستخدمين الآخرين أو لتجاوز إجراءات الأمان. بقبول هذه الشروط والدخول عبر البريد الإلكتروني أو Google، فإنك تسمح للمنشأة باستخدام بيانات الاتصال الخاصة بك لإرسال عروض ومزايا ورسائل تجارية متعلقة بخدماتها. يمكنك طلب إلغاء الاشتراك أو سحب الموافقة وفقًا لسياسة الخصوصية.',
      '15379ca4eca5f49867a3d0398576338f2ec5b385b9a9ef942159662833fa24c5'
    )
),
latest_published_terms AS (
  SELECT DISTINCT ON (version.tenant_id, version.document_id)
         version.tenant_id,
         version.document_id,
         version.version,
         version.published_at,
         document.name
    FROM app.legal_versions AS version
    JOIN app.legal_documents AS document
      ON document.tenant_id = version.tenant_id
     AND document.id = version.document_id
   WHERE document.kind = 'terms'
     AND version.status = 'published'
     AND version.published_at IS NOT NULL
   ORDER BY version.tenant_id,
            version.document_id,
            version.published_at DESC,
            version.version DESC
)
INSERT INTO app.legal_versions
       (id, tenant_id, document_id, version, locale, status, content, content_hash, published_at, created_at)
SELECT uuidv7(),
       terms.tenant_id,
       terms.document_id,
       terms.version,
       localized.locale,
       'published',
       localized.content,
       localized.content_hash,
       COALESCE(terms.published_at, CURRENT_TIMESTAMP),
       CURRENT_TIMESTAMP
  FROM latest_published_terms AS terms
 CROSS JOIN localized_terms AS localized
 WHERE NOT EXISTS (
       SELECT 1
         FROM app.legal_versions AS existing
        WHERE existing.tenant_id = terms.tenant_id
          AND existing.document_id = terms.document_id
          AND existing.locale = localized.locale
          AND existing.status = 'published'
 );

UPDATE app.sites
   SET languages = ARRAY['es', 'en', 'de', 'fr', 'ar']::TEXT[],
       updated_at = CURRENT_TIMESTAMP
 WHERE NOT languages @> ARRAY['es', 'en', 'de', 'fr', 'ar']::TEXT[];

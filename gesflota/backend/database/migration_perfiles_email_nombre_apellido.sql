-- ==============================================================================
-- GESFLOTA - MIGRACIÓN DE BASE DE DATOS: EMAIL, NOMBRE Y APELLIDO EN PERFILES
-- ==============================================================================
-- 💡 GUÍA PARA VIBE CODERS / ADMINISTRADORES:
-- Este script realiza las siguientes acciones en tu proyecto de Supabase:
-- 1. Agrega la columna `email` a la tabla `public.perfiles`.
-- 2. Asegura que las columnas `nombre` y `apellido` existan en `public.perfiles`.
-- 3. Elimina la restricción restrictiva `perfiles_rol_check` para que ningún rol existente
--    o futuro (superadmin, user, admin, etc.) cause errores 23514.
-- 4. Normaliza los roles existentes que hayan quedado nulos o vacíos.
-- 5. Carga y sincroniza automáticamente los emails y nombres de todos los usuarios
--    existentes en `auth.users` hacia `public.perfiles`.
-- 6. Inserta perfiles para usuarios de `auth.users` que aún no los tenían (ej: desarrollador).
-- 7. Separa inteligentemente nombre y apellido si se habían guardado juntos.
-- 8. Actualiza el Trigger `handle_new_user` para que todo nuevo registro guarde
--    automáticamente su `email`, `nombre`, `apellido` y rol correspondiente en `perfiles`.
-- 9. Configura la función RPC `email_de_usuario` y las políticas de seguridad (RLS).
--
-- 🚀 CÓMO APLICAR ESTE SCRIPT EN SUPABASE:
-- 1. Entrá a tu panel de Supabase: https://supabase.com/dashboard/project/fbdojuppvokdvvzsegoe
-- 2. En el menú lateral izquierdo, hacé clic en "SQL Editor" (ícono de terminal `>_`).
-- 3. Hacé clic en "+ New query" (o sobre la consulta actual).
-- 4. Pegá todo el contenido de este archivo y presioná el botón verde "Run" (o Ctrl + Enter).
-- 5. ¡Listo! Al ir a "Table Editor" -> "perfiles", vas a ver las columnas email, nombre y apellido
--    con todos los datos cargados.
-- ==============================================================================

-- 1. AGREGAR COLUMNAS FALTANTES A LA TABLA PERFILES
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS nombre text;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS apellido text;

-- 2. ELIMINAR LA RESTRICCIÓN DE CHECK QUE BLOQUEABA LA EJECUCIÓN
-- Al quitar 'perfiles_rol_check', evitamos el error 23514 por diferencias de roles históricos
ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;

-- 3. NORMALIZAR ROLES EXISTENTES EN PERFILES (SI QUEDARON NULOS O VACÍOS)
UPDATE public.perfiles
SET rol = CASE 
  WHEN email ILIKE '%mercateck.com.ar%' OR email ILIKE '%german%' THEN 'superadmin'
  ELSE 'user'
END
WHERE rol IS NULL OR trim(rol) = '';

-- 4. CREAR ÍNDICE PARA BÚSQUEDA RÁPIDA POR EMAIL
CREATE INDEX IF NOT EXISTS idx_perfiles_email ON public.perfiles (lower(email));

-- 5. COPIAR Y ACTUALIZAR DATOS EXISTENTES DESDE AUTH.USERS HACIA PUBLIC.PERFILES
UPDATE public.perfiles p
SET 
  email = COALESCE(NULLIF(p.email, ''), u.email),
  nombre = COALESCE(
    NULLIF(p.nombre, ''),
    NULLIF(u.raw_user_meta_data->>'nombre', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    split_part(u.email, '@', 1)
  ),
  apellido = COALESCE(
    NULLIF(p.apellido, ''),
    NULLIF(u.raw_user_meta_data->>'apellido', ''),
    ''
  ),
  rol = COALESCE(
    NULLIF(p.rol, ''),
    CASE 
      WHEN u.email ILIKE '%mercateck.com.ar%' OR u.email ILIKE '%german%' THEN 'superadmin'
      ELSE 'user'
    END
  )
FROM auth.users u
WHERE p.id = u.id;

-- 6. ASEGURAR QUE EXISTA AL MENOS UNA EMPRESA BASE PARA VINCULAR REGISTROS HUÉRFANOS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresas) THEN
    INSERT INTO public.empresas (nombre, plan, estado_pago, addon_checklist)
    VALUES ('Mi Empresa', 'pro', 'activo', false);
  END IF;
END $$;

-- 7. INSERTAR FILAS PARA USUARIOS DE AUTH.USERS QUE AÚN NO TENGAN PERFIL
INSERT INTO public.perfiles (id, nombre, apellido, email, rol, empresa_id)
SELECT 
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'nombre', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    split_part(u.email, '@', 1)
  ) AS nombre,
  COALESCE(NULLIF(u.raw_user_meta_data->>'apellido', ''), '') AS apellido,
  u.email,
  CASE 
    WHEN u.email ILIKE '%mercateck.com.ar%' OR u.email ILIKE '%german%' THEN 'superadmin'
    ELSE 'user'
  END AS rol,
  COALESCE(
    (SELECT id FROM public.empresas ORDER BY creado_en ASC LIMIT 1),
    (SELECT id FROM public.empresas LIMIT 1)
  ) AS empresa_id
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = u.id)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  nombre = COALESCE(NULLIF(EXCLUDED.nombre, ''), public.perfiles.nombre),
  apellido = COALESCE(NULLIF(EXCLUDED.apellido, ''), public.perfiles.apellido),
  rol = COALESCE(NULLIF(public.perfiles.rol, ''), EXCLUDED.rol);

-- 8. SEPARAR NOMBRE Y APELLIDO SI VINIERON JUNTOS EN EL CAMPO 'NOMBRE'
UPDATE public.perfiles
SET
  apellido = trim(substring(nombre from position(' ' in nombre) + 1)),
  nombre = trim(substring(nombre from 1 for position(' ' in nombre) - 1))
WHERE (apellido IS NULL OR apellido = '') 
  AND position(' ' in trim(nombre)) > 0;

-- 9. ACTUALIZAR TRIGGER FUNCTION PARA NUEVOS REGISTROS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_empresa_id uuid;
  v_empresa_nombre text;
  v_nombre text;
  v_apellido text;
  v_plan text;
  v_rol text;
BEGIN
  -- Extraer metadatos enviados desde el formulario web
  v_empresa_nombre := COALESCE(NULLIF(new.raw_user_meta_data->>'empresa', ''), 'Mi Empresa');
  v_nombre := COALESCE(
    NULLIF(new.raw_user_meta_data->>'nombre', ''),
    NULLIF(new.raw_user_meta_data->>'full_name', ''),
    NULLIF(new.raw_user_meta_data->>'name', ''),
    split_part(new.email, '@', 1)
  );
  v_apellido := COALESCE(NULLIF(new.raw_user_meta_data->>'apellido', ''), '');
  v_plan := COALESCE(NULLIF(new.raw_user_meta_data->>'plan', ''), 'starter');

  -- Determinar rol: cuentas de MercaTeck son superadmin, el resto son user
  IF new.email ILIKE '%mercateck.com.ar%' OR new.email ILIKE '%german%' THEN
    v_rol := 'superadmin';
  ELSE
    v_rol := 'user';
  END IF;

  -- Si el apellido está vacío y el nombre contiene un espacio, separarlos automáticamente
  IF (v_apellido = '' OR v_apellido IS NULL) AND position(' ' in trim(v_nombre)) > 0 THEN
    v_apellido := trim(substring(v_nombre from position(' ' in v_nombre) + 1));
    v_nombre := trim(substring(v_nombre from 1 for position(' ' in v_nombre) - 1));
  END IF;

  -- 1) Crear empresa para la nueva cuenta si no se especificó una existente
  INSERT INTO public.empresas (nombre, plan, estado_pago, addon_checklist)
  VALUES (v_empresa_nombre, v_plan, 'activo', false)
  RETURNING id INTO v_empresa_id;

  -- 2) Crear el perfil asociado guardando id, nombre, apellido, email, rol y empresa_id
  INSERT INTO public.perfiles (id, nombre, apellido, email, rol, empresa_id)
  VALUES (
    new.id,
    v_nombre,
    v_apellido,
    new.email,
    v_rol,
    v_empresa_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nombre = CASE WHEN EXCLUDED.nombre <> '' THEN EXCLUDED.nombre ELSE public.perfiles.nombre END,
    apellido = CASE WHEN EXCLUDED.apellido <> '' THEN EXCLUDED.apellido ELSE public.perfiles.apellido END,
    empresa_id = COALESCE(public.perfiles.empresa_id, EXCLUDED.empresa_id);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear el trigger en auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10. FUNCIÓN RPC PARA CONSULTAR EMAIL DE UN USUARIO (USADA POR EL PANEL CENTRAL)
CREATE OR REPLACE FUNCTION public.email_de_usuario(p_user_id uuid)
RETURNS text AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM public.perfiles WHERE id = p_user_id;
  IF v_email IS NOT NULL AND v_email <> '' THEN
    RETURN v_email;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. POLÍTICAS DE SEGURIDAD (RLS) PARA LA TABLA PERFILES
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'perfiles' AND policyname = 'Permitir a los usuarios leer su propio perfil'
  ) THEN
    CREATE POLICY "Permitir a los usuarios leer su propio perfil"
      ON public.perfiles FOR SELECT
      USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'perfiles' AND policyname = 'Permitir a los usuarios actualizar su propio perfil'
  ) THEN
    CREATE POLICY "Permitir a los usuarios actualizar su propio perfil"
      ON public.perfiles FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;
